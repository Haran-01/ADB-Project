-- Phase 17: Pure Distributed Architecture - Eliminate Central Table Duplication

-- 1. Drop table triggers on railway_main views before dropping central tables
drop trigger if exists trg_station_network on railway_main.stations;
drop trigger if exists trg_track_network on railway_main.tracks;
drop trigger if exists trg_touch_updated_at on railway_main.stations;
drop trigger if exists trg_touch_updated_at on railway_main.tracks;
drop trigger if exists trg_touch_updated_at on railway_main.trains;
drop trigger if exists trg_touch_updated_at on railway_main.train_schedules;
drop trigger if exists trg_track_consistency on railway_main.tracks;
drop trigger if exists trg_track_change on railway_main.tracks;
drop trigger if exists trg_train_change on railway_main.trains;
drop trigger if exists trg_sync_stations_fragment on railway_main.stations;
drop trigger if exists trg_sync_tracks_fragment on railway_main.tracks;
drop trigger if exists trg_sync_trains_fragment on railway_main.trains;
drop trigger if exists trg_sync_schedules_fragment on railway_main.train_schedules;
drop function if exists railway_main.trg_sync_horizontal_fragments();

-- 2. Drop constraints referencing central tables to allow conversion to unified views
alter table railway_main.train_journeys drop constraint if exists train_journeys_train_id_fkey;
alter table railway_main.train_journeys drop constraint if exists train_journeys_current_station_id_fkey;
alter table railway_main.train_journeys drop constraint if exists train_journeys_next_station_id_fkey;
alter table railway_main.disruptions drop constraint if exists disruptions_track_id_fkey;
alter table railway_main.disruptions drop constraint if exists disruptions_station_id_fkey;

-- 3. Replace central physical tables with views over the physical regional nodes
drop table if exists railway_main.train_schedules cascade;
drop table if exists railway_main.trains cascade;
drop table if exists railway_main.tracks cascade;
drop table if exists railway_main.stations cascade;

create or replace view railway_main.stations as
select * from railway_south.stations
union all select * from railway_central.stations
union all select * from railway_north.stations;

create or replace view railway_main.tracks as
select * from railway_south.tracks
union all select * from railway_central.tracks
union all select * from railway_north.tracks;

create or replace view railway_main.trains as
select * from railway_south.trains
union all select * from railway_central.trains
union all select * from railway_north.trains;

create or replace view railway_main.train_schedules as
select * from railway_south.train_schedules
union all select * from railway_central.train_schedules
union all select * from railway_north.train_schedules;

-- Triggers are applied during DB logic setup

-- 5. INSTEAD OF Triggers to make views writable and route writes directly to regional physical node tables
create or replace function railway_main.trg_instead_of_distributed_write() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare
  reg_code text;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if tg_table_name = 'stations' then
      select code into reg_code from railway_main.regions where id = new.region_id;
      if reg_code = 'CR' then
        insert into railway_central.stations values (new.*) on conflict (station_code) do update set status=excluded.status;
      elsif reg_code = 'NR' then
        insert into railway_north.stations values (new.*) on conflict (station_code) do update set status=excluded.status;
      else
        insert into railway_south.stations values (new.*) on conflict (station_code) do update set status=excluded.status;
      end if;
      return new;
    elsif tg_table_name = 'tracks' then
      select code into reg_code from railway_main.regions where id = new.region_id;
      if reg_code = 'CR' then
        insert into railway_central.tracks values (new.*) on conflict (from_station_id,to_station_id) do update set status=excluded.status;
      elsif reg_code = 'NR' then
        insert into railway_north.tracks values (new.*) on conflict (from_station_id,to_station_id) do update set status=excluded.status;
      else
        insert into railway_south.tracks values (new.*) on conflict (from_station_id,to_station_id) do update set status=excluded.status;
      end if;
      return new;
    elsif tg_table_name = 'trains' then
      select r.code into reg_code from railway_main.stations s 
      join railway_main.regions r on r.id = s.region_id where s.id = new.source_station_id;
      if reg_code = 'CR' then
        insert into railway_central.trains values (new.*) on conflict (train_number) do update set status=excluded.status;
      elsif reg_code = 'NR' then
        insert into railway_north.trains values (new.*) on conflict (train_number) do update set status=excluded.status;
      else
        insert into railway_south.trains values (new.*) on conflict (train_number) do update set status=excluded.status;
      end if;
      return new;
    elsif tg_table_name = 'train_schedules' then
      select r.code into reg_code from railway_main.stations s 
      join railway_main.regions r on r.id = s.region_id where s.id = new.station_id;
      if reg_code = 'CR' then
        insert into railway_central.train_schedules values (new.*) on conflict (train_id,station_id,stop_sequence) do update set platform=excluded.platform;
      elsif reg_code = 'NR' then
        insert into railway_north.train_schedules values (new.*) on conflict (train_id,station_id,stop_sequence) do update set platform=excluded.platform;
      else
        insert into railway_south.train_schedules values (new.*) on conflict (train_id,station_id,stop_sequence) do update set platform=excluded.platform;
      end if;
      return new;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_io_stations on railway_main.stations;
create trigger trg_io_stations instead of insert or update on railway_main.stations
  for each row execute function railway_main.trg_instead_of_distributed_write();

drop trigger if exists trg_io_tracks on railway_main.tracks;
create trigger trg_io_tracks instead of insert or update on railway_main.tracks
  for each row execute function railway_main.trg_instead_of_distributed_write();

drop trigger if exists trg_io_trains on railway_main.trains;
create trigger trg_io_trains instead of insert or update on railway_main.trains
  for each row execute function railway_main.trg_instead_of_distributed_write();

drop trigger if exists trg_io_schedules on railway_main.train_schedules;
create trigger trg_io_schedules instead of insert or update on railway_main.train_schedules
  for each row execute function railway_main.trg_instead_of_distributed_write();

-- 6. Clean up permissions
grant select, insert, update on railway_main.stations, railway_main.tracks, railway_main.trains, railway_main.train_schedules to railway_app;
