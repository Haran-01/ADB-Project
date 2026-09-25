-- Prevent parent edits from invalidating existing relationships.
create or replace function public.trg_station_parent_consistency() returns trigger
language plpgsql set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
begin
  if (old.geom::text,old.region_id) is distinct from (new.geom::text,new.region_id) and exists (
    select 1 from tracks where from_station_id=new.id or to_station_id=new.id) then
    raise exception 'Station coordinates/region cannot change while tracks reference it; migrate network consistently' using errcode='23514';
  end if;
  return new;
end $$;

do $$ declare s text; begin
  foreach s in array array['railway_south','railway_central','railway_north'] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=s and c.relname='stations' and c.relkind='r') then
      execute format('create or replace trigger trg_station_parent_consistency before update on %I.stations for each row execute function public.trg_station_parent_consistency()', s);
    end if;
  end loop;
end $$;

create or replace function public.trg_schedule_parent_consistency() returns trigger
language plpgsql set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
begin
  if exists(select 1 from train_journeys where train_id=old.train_id and active_route is null
    and (current_station_id=old.station_id or next_station_id=old.station_id))
    and not exists(select 1 from train_schedules where train_id=old.train_id and station_id=old.station_id) then
    raise exception 'Cannot remove a station used by a current journey' using errcode='23514';
  end if;
  return null;
end $$;

do $$ declare s text; begin
  foreach s in array array['railway_south','railway_central','railway_north'] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=s and c.relname='train_schedules' and c.relkind='r') then
      execute format('drop trigger if exists trg_schedule_parent_consistency on %I.train_schedules', s);
      execute format('create constraint trigger trg_schedule_parent_consistency after delete or update on %I.train_schedules deferrable initially deferred for each row execute function public.trg_schedule_parent_consistency()', s);
    end if;
  end loop;
end $$;

create or replace function public.trg_network_change() returns trigger
language plpgsql set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
declare entity uuid;
begin
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return new; end if;
  entity=case when tg_op='DELETE' then old.id else new.id end;
  insert into event_log(event_type,entity_type,entity_id,payload)
    values('TRACK_STATUS_CHANGED',tg_table_name,entity,jsonb_build_object('id',entity,'operation',tg_op));
  return null;
end $$;

do $$ declare s text; begin
  foreach s in array array['railway_south','railway_central','railway_north'] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=s and c.relname='stations' and c.relkind='r') then
      execute format('create or replace trigger trg_station_network after insert or update or delete on %I.stations for each row execute function public.trg_network_change()', s);
    end if;
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=s and c.relname='tracks' and c.relkind='r') then
      execute format('create or replace trigger trg_track_network after insert or update or delete on %I.tracks for each row execute function public.trg_network_change()', s);
    end if;
  end loop;
end $$;
