create or replace function railway_main.trg_touch_updated_at() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin new.updated_at=clock_timestamp(); return new; end $$;

create or replace function railway_main.trg_track_consistency() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare a stations; b stations;
begin
  select * into strict a from stations where id=new.from_station_id for share;
  select * into strict b from stations where id=new.to_station_id for share;
  if new.region_id not in (a.region_id,b.region_id) then
    raise exception 'Track region must own at least one endpoint' using errcode='23514';
  end if;
  if not ST_DWithin(ST_StartPoint(new.geom::geometry)::geography,a.geom,1)
     or not ST_DWithin(ST_EndPoint(new.geom::geometry)::geography,b.geom,1) then
    raise exception 'Track geometry endpoints must match stations within one metre' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function railway_main.trg_journey_consistency() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if new.active_route is null then
    if exists (select 1 from unnest(array[new.current_station_id,new.next_station_id]) s(id)
      where id is not null and not exists(select 1 from train_schedules where train_id=new.train_id and station_id=s.id)) then
      raise exception 'Journey stations must belong to train schedule' using errcode='23514';
    end if;
  else
    if jsonb_typeof(new.active_route)<>'array' or exists (
      select 1 from stations s where s.id in (new.current_station_id,new.next_station_id)
        and not new.active_route ? s.station_code) then
      raise exception 'Journey stations must belong to applied route' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create or replace function railway_main.trg_track_change() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if old.status is distinct from new.status then
    insert into track_status_history(track_id,old_status,new_status,changed_by,reason)
      values(new.id,old.status,new.status,coalesce(current_setting('railway.actor',true),current_user),'Track status changed');
    insert into event_log(event_type,entity_type,entity_id,payload)
      values('TRACK_STATUS_CHANGED','tracks',new.id,jsonb_build_object('track_id',new.id,'status',new.status));
    if old.status='ACTIVE' and new.status='FAILED' and not exists (
      select 1 from disruptions where track_id=new.id and status in ('OPEN','ANALYZING')) then
      insert into disruptions(type,track_id,severity,reported_by,description,geom)
        values('TRACK_FAILURE',new.id,'HIGH',coalesce(current_setting('railway.actor',true),current_user),
          'Automatically detected ACTIVE to FAILED transition',ST_LineInterpolatePoint(new.geom::geometry,0.5)::geography);
    end if;
  end if;
  return new;
end $$;

create or replace function railway_main.trg_disruption_change() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status then
    insert into disruption_history(disruption_id,old_status,new_status,changed_by,note)
      values(new.id,case when tg_op='UPDATE' then old.status end,new.status,
        coalesce(current_setting('railway.actor',true),new.reported_by,current_user),'Disruption state changed');
  end if;
  if tg_op='INSERT' then
    insert into event_log(event_type,entity_type,entity_id,payload)
      values('DISRUPTION_CREATED','disruptions',new.id,jsonb_build_object('disruption_id',new.id));
  elsif old.analysis_status is distinct from new.analysis_status and new.analysis_status in ('PROCESSING','COMPLETED') then
    insert into event_log(event_type,entity_type,entity_id,payload)
      values(case when new.analysis_status='PROCESSING' then 'DISRUPTION_ANALYSIS_REQUESTED'::event_type
        else 'DISRUPTION_ANALYSIS_COMPLETED'::event_type end,'disruptions',new.id,jsonb_build_object('disruption_id',new.id));
  end if;
  return new;
end $$;

create or replace function railway_main.trg_train_change() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if old.status is distinct from new.status then
    insert into train_status_history(train_id,old_status,new_status,changed_by)
      values(new.id,old.status,new.status,coalesce(current_setting('railway.actor',true),current_user));
    insert into event_log(event_type,entity_type,entity_id,payload)
      values('TRAIN_STATUS_CHANGED','trains',new.id,jsonb_build_object('train_id',new.id,'status',new.status));
  end if; return new;
end $$;

create or replace function railway_main.trg_journey_change() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if old.delay_minutes is distinct from new.delay_minutes then
    insert into journey_delay_history(train_journey_id,old_delay_minutes,new_delay_minutes,changed_by)
      values(new.id,old.delay_minutes,new.delay_minutes,coalesce(current_setting('railway.actor',true),current_user));
  end if;
  if old.journey_status is distinct from new.journey_status then
    insert into journey_status_history(train_journey_id,old_status,new_status,changed_by)
      values(new.id,old.journey_status,new.journey_status,coalesce(current_setting('railway.actor',true),current_user));
    insert into event_log(event_type,entity_type,entity_id,payload)
      values('JOURNEY_STATUS_CHANGED','train_journeys',new.id,jsonb_build_object('train_journey_id',new.id,'status',new.journey_status));
  end if; return new;
end $$;

create or replace function railway_main.trg_publish_entity() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  insert into event_log(event_type,entity_type,entity_id,payload)
    values(tg_argv[0]::event_type,tg_table_name,new.id,
      jsonb_build_object('id',new.id,'disruption_id',new.disruption_id,'train_journey_id',new.train_journey_id));
  return new;
end $$;
create or replace function railway_main.trg_outbox_notify() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin perform pg_notify('railway_events',jsonb_build_object('event_id',new.id)::text); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['regions','stations','tracks','trains','train_schedules','train_journeys','disruptions','affected_trains','route_recommendations'] loop
    execute format('create or replace trigger trg_touch_updated_at before update on railway_main.%I for each row execute function railway_main.trg_touch_updated_at()',t);
  end loop;
end $$;
create or replace trigger trg_track_consistency before insert or update on railway_main.tracks for each row execute function railway_main.trg_track_consistency();
create or replace trigger trg_journey_consistency before insert or update on railway_main.train_journeys for each row execute function railway_main.trg_journey_consistency();
create or replace trigger trg_track_change after update on railway_main.tracks for each row execute function railway_main.trg_track_change();
create or replace trigger trg_disruption_change after insert or update on railway_main.disruptions for each row execute function railway_main.trg_disruption_change();
create or replace trigger trg_train_change after update on railway_main.trains for each row execute function railway_main.trg_train_change();
create or replace trigger trg_journey_change after update on railway_main.train_journeys for each row execute function railway_main.trg_journey_change();
create or replace trigger trg_affected_event after insert on railway_main.affected_trains for each row execute function railway_main.trg_publish_entity('TRAIN_AFFECTED');
create or replace trigger trg_recommendation_event after insert on railway_main.route_recommendations for each row execute function railway_main.trg_publish_entity('ROUTE_RECOMMENDED');
create or replace trigger trg_outbox_notify after insert on railway_main.event_log for each row execute function railway_main.trg_outbox_notify();
