-- Phase 16: Physical horizontal fragmentation across regional database schemas.

-- 0. Drop pre-existing views in regional schemas so physical tables can be created
drop view if exists railway_south.stations cascade;
drop view if exists railway_central.stations cascade;
drop view if exists railway_north.stations cascade;
drop view if exists railway_south.tracks cascade;
drop view if exists railway_central.tracks cascade;
drop view if exists railway_north.tracks cascade;

-- 1. Regional Stations Tables
create table if not exists railway_south.stations (
  like railway_main.stations including defaults including constraints including indexes
);
create table if not exists railway_central.stations (
  like railway_main.stations including defaults including constraints including indexes
);
create table if not exists railway_north.stations (
  like railway_main.stations including defaults including constraints including indexes
);

-- 2. Regional Tracks Tables
create table if not exists railway_south.tracks (
  like railway_main.tracks including defaults including constraints including indexes
);
create table if not exists railway_central.tracks (
  like railway_main.tracks including defaults including constraints including indexes
);
create table if not exists railway_north.tracks (
  like railway_main.tracks including defaults including constraints including indexes
);

-- 3. Regional Trains Tables
create table if not exists railway_south.trains (
  like railway_main.trains including defaults including constraints including indexes
);
create table if not exists railway_central.trains (
  like railway_main.trains including defaults including constraints including indexes
);
create table if not exists railway_north.trains (
  like railway_main.trains including defaults including constraints including indexes
);

-- 4. Regional Train Schedules Tables
create table if not exists railway_south.train_schedules (
  like railway_main.train_schedules including defaults including constraints including indexes
);
create table if not exists railway_central.train_schedules (
  like railway_main.train_schedules including defaults including constraints including indexes
);
create table if not exists railway_north.train_schedules (
  like railway_main.train_schedules including defaults including constraints including indexes
);

-- 5. Recreate Coordinator Views pointing to the physical regional tables
create or replace view railway_main.v_distributed_stations as
select 'railway_south'::text storage_region, s.* from railway_south.stations s
union all select 'railway_central', s.* from railway_central.stations s
union all select 'railway_north', s.* from railway_north.stations s;

create or replace view railway_main.v_distributed_tracks as
select 'railway_south'::text storage_region, t.* from railway_south.tracks t
union all select 'railway_central', t.* from railway_central.tracks t
union all select 'railway_north', t.* from railway_north.tracks t;

-- 6. Helper Function to Synchronize Central Table Inserts to Physical Regional Fragments
create or replace function railway_main.trg_sync_horizontal_fragments() returns trigger
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare
  reg_code text;
begin
  if tg_table_name = 'stations' then
    select code into reg_code from railway_main.regions where id = new.region_id;
    if reg_code = 'SR' then
      insert into railway_south.stations(id,station_code,name,region_id,zone,state,latitude,longitude,geom,status,created_at,updated_at)
        values (new.id,new.station_code,new.name,new.region_id,new.zone,new.state,new.latitude,new.longitude,new.geom,new.status,new.created_at,new.updated_at)
        on conflict (station_code) do update set status = excluded.status;
    elsif reg_code = 'CR' then
      insert into railway_central.stations(id,station_code,name,region_id,zone,state,latitude,longitude,geom,status,created_at,updated_at)
        values (new.id,new.station_code,new.name,new.region_id,new.zone,new.state,new.latitude,new.longitude,new.geom,new.status,new.created_at,new.updated_at)
        on conflict (station_code) do update set status = excluded.status;
    elsif reg_code = 'NR' then
      insert into railway_north.stations(id,station_code,name,region_id,zone,state,latitude,longitude,geom,status,created_at,updated_at)
        values (new.id,new.station_code,new.name,new.region_id,new.zone,new.state,new.latitude,new.longitude,new.geom,new.status,new.created_at,new.updated_at)
        on conflict (station_code) do update set status = excluded.status;
    end if;
  elsif tg_table_name = 'tracks' then
    select code into reg_code from railway_main.regions where id = new.region_id;
    if reg_code = 'SR' then
      insert into railway_south.tracks(id,from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,status,geom,valid_from,valid_to,created_at,updated_at)
        values (new.id,new.from_station_id,new.to_station_id,new.region_id,new.distance_km,new.track_type,new.speed_limit_kmph,new.status,new.geom,new.valid_from,new.valid_to,new.created_at,new.updated_at)
        on conflict (from_station_id,to_station_id) do update set status = excluded.status;
    elsif reg_code = 'CR' then
      insert into railway_central.tracks(id,from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,status,geom,valid_from,valid_to,created_at,updated_at)
        values (new.id,new.from_station_id,new.to_station_id,new.region_id,new.distance_km,new.track_type,new.speed_limit_kmph,new.status,new.geom,new.valid_from,new.valid_to,new.created_at,new.updated_at)
        on conflict (from_station_id,to_station_id) do update set status = excluded.status;
    elsif reg_code = 'NR' then
      insert into railway_north.tracks(id,from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,status,geom,valid_from,valid_to,created_at,updated_at)
        values (new.id,new.from_station_id,new.to_station_id,new.region_id,new.distance_km,new.track_type,new.speed_limit_kmph,new.status,new.geom,new.valid_from,new.valid_to,new.created_at,new.updated_at)
        on conflict (from_station_id,to_station_id) do update set status = excluded.status;
    end if;
  elsif tg_table_name = 'trains' then
    select r.code into reg_code from railway_main.stations s 
    join railway_main.regions r on r.id = s.region_id where s.id = new.source_station_id;
    if reg_code = 'SR' then
      insert into railway_south.trains(id,train_number,name,train_type,priority,source_station_id,destination_station_id,status,created_at,updated_at)
        values (new.id,new.train_number,new.name,new.train_type,new.priority,new.source_station_id,new.destination_station_id,new.status,new.created_at,new.updated_at)
        on conflict (train_number) do update set status = excluded.status;
    elsif reg_code = 'CR' then
      insert into railway_central.trains(id,train_number,name,train_type,priority,source_station_id,destination_station_id,status,created_at,updated_at)
        values (new.id,new.train_number,new.name,new.train_type,new.priority,new.source_station_id,new.destination_station_id,new.status,new.created_at,new.updated_at)
        on conflict (train_number) do update set status = excluded.status;
    elsif reg_code = 'NR' then
      insert into railway_north.trains(id,train_number,name,train_type,priority,source_station_id,destination_station_id,status,created_at,updated_at)
        values (new.id,new.train_number,new.name,new.train_type,new.priority,new.source_station_id,new.destination_station_id,new.status,new.created_at,new.updated_at)
        on conflict (train_number) do update set status = excluded.status;
    end if;
  elsif tg_table_name = 'train_schedules' then
    select r.code into reg_code from railway_main.stations s 
    join railway_main.regions r on r.id = s.region_id where s.id = new.station_id;
    if reg_code = 'SR' then
      insert into railway_south.train_schedules(id,train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset,platform,created_at,updated_at)
        values (new.id,new.train_id,new.station_id,new.stop_sequence,new.scheduled_arrival,new.scheduled_departure,new.day_offset,new.platform,new.created_at,new.updated_at)
        on conflict (train_id, station_id, stop_sequence) do update set platform = excluded.platform;
    elsif reg_code = 'CR' then
      insert into railway_central.train_schedules(id,train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset,platform,created_at,updated_at)
        values (new.id,new.train_id,new.station_id,new.stop_sequence,new.scheduled_arrival,new.scheduled_departure,new.day_offset,new.platform,new.created_at,new.updated_at)
        on conflict (train_id, station_id, stop_sequence) do update set platform = excluded.platform;
    elsif reg_code = 'NR' then
      insert into railway_north.train_schedules(id,train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset,platform,created_at,updated_at)
        values (new.id,new.train_id,new.station_id,new.stop_sequence,new.scheduled_arrival,new.scheduled_departure,new.day_offset,new.platform,new.created_at,new.updated_at)
        on conflict (train_id, station_id, stop_sequence) do update set platform = excluded.platform;
    end if;
  end if;
  return new;
end $$;

-- 7. Attach triggers to populate horizontal table fragments automatically
drop trigger if exists trg_sync_stations_fragment on railway_main.stations;
create trigger trg_sync_stations_fragment after insert or update on railway_main.stations
  for each row execute function railway_main.trg_sync_horizontal_fragments();

drop trigger if exists trg_sync_tracks_fragment on railway_main.tracks;
create trigger trg_sync_tracks_fragment after insert or update on railway_main.tracks
  for each row execute function railway_main.trg_sync_horizontal_fragments();

drop trigger if exists trg_sync_trains_fragment on railway_main.trains;
create trigger trg_sync_trains_fragment after insert or update on railway_main.trains
  for each row execute function railway_main.trg_sync_horizontal_fragments();

drop trigger if exists trg_sync_schedules_fragment on railway_main.train_schedules;
create trigger trg_sync_schedules_fragment after insert or update on railway_main.train_schedules
  for each row execute function railway_main.trg_sync_horizontal_fragments();

-- 8. Grant Permissions to Regional Schemas
grant all on schema railway_south, railway_central, railway_north to railway_app;
grant all on all tables in schema railway_south, railway_central, railway_north to railway_app;
grant select on railway_main.v_distributed_stations, railway_main.v_distributed_tracks to railway_app;
