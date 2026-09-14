-- Prevent parent edits from invalidating existing relationships.
create or replace function railway_main.trg_station_parent_consistency() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if (old.geom::text,old.region_id) is distinct from (new.geom::text,new.region_id) and exists (
    select 1 from tracks where from_station_id=new.id or to_station_id=new.id) then
    raise exception 'Station coordinates/region cannot change while tracks reference it; migrate network consistently' using errcode='23514';
  end if;
  return new;
end $$;
create or replace trigger trg_station_parent_consistency before update on railway_main.stations
  for each row execute function railway_main.trg_station_parent_consistency();

create or replace function railway_main.trg_schedule_parent_consistency() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if exists(select 1 from train_journeys where train_id=old.train_id and active_route is null
    and (current_station_id=old.station_id or next_station_id=old.station_id))
    and not exists(select 1 from train_schedules where train_id=old.train_id and station_id=old.station_id) then
    raise exception 'Cannot remove a station used by a current journey' using errcode='23514';
  end if;
  return null;
end $$;
drop trigger if exists trg_schedule_parent_consistency on railway_main.train_schedules;
create constraint trigger trg_schedule_parent_consistency after delete or update on railway_main.train_schedules
  deferrable initially deferred for each row execute function railway_main.trg_schedule_parent_consistency();

create or replace function railway_main.trg_network_change() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare entity uuid;
begin
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return new; end if;
  entity=case when tg_op='DELETE' then old.id else new.id end;
  insert into event_log(event_type,entity_type,entity_id,payload)
    values('NETWORK_CHANGED',tg_table_name,entity,jsonb_build_object('id',entity,'operation',tg_op));
  return null;
end $$;
create or replace trigger trg_station_network after insert or update or delete on railway_main.stations
  for each row execute function railway_main.trg_network_change();
create or replace trigger trg_track_network after insert or update or delete on railway_main.tracks
  for each row execute function railway_main.trg_network_change();
