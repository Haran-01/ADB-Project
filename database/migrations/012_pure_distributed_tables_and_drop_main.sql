-- Phase 18: Pure Distributed Architecture - Remove central railway_main schema completely.

-- 1. Create public system tracking tables if they don't exist
create table if not exists public.schema_migrations (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);

create table if not exists public.logic_artifacts (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);

-- Copy existing migrations tracking if railway_main exists
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'railway_main') then
    insert into public.schema_migrations (filename, checksum, applied_at)
    select filename, checksum, applied_at from railway_main.schema_migrations
    on conflict (filename) do update set checksum = excluded.checksum, applied_at = excluded.applied_at;

    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'logic_artifacts') then
      insert into public.logic_artifacts (filename, checksum, applied_at)
      select filename, checksum, applied_at from railway_main.logic_artifacts
      on conflict (filename) do update set checksum = excluded.checksum, applied_at = excluded.applied_at;
    end if;
  end if;
end $$;

-- 2. Create Types in public schema
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'station_status') then
    create type public.station_status as enum ('ACTIVE', 'CLOSED', 'MAINTENANCE');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'track_status') then
    create type public.track_status as enum ('ACTIVE', 'FAILED', 'MAINTENANCE', 'BLOCKED');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'train_type') then
    create type public.train_type as enum ('EXPRESS', 'PASSENGER', 'SUPERFAST', 'INTERCITY', 'FREIGHT');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'train_status') then
    create type public.train_status as enum ('SCHEDULED', 'RUNNING', 'DELAYED', 'REROUTED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'journey_status') then
    create type public.journey_status as enum ('SCHEDULED', 'RUNNING', 'DELAYED', 'REROUTED', 'COMPLETED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'disruption_type') then
    create type public.disruption_type as enum ('TRACK_FAILURE', 'ACCIDENT', 'MAINTENANCE', 'STATION_CLOSURE', 'ROUTE_BLOCKAGE');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'disruption_severity') then
    create type public.disruption_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'disruption_status') then
    create type public.disruption_status as enum ('OPEN', 'ANALYZING', 'RESOLVED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'impact_type') then
    create type public.impact_type as enum ('DIRECT_TRACK_BLOCK', 'STATION_CLOSURE', 'UPSTREAM_DELAY', 'DOWNSTREAM_DELAY', 'REGIONAL_IMPACT');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'affected_train_status') then
    create type public.affected_train_status as enum ('PENDING', 'WAITING', 'REROUTED', 'CANCELLED', 'CLEARED');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'recommendation_status') then
    create type public.recommendation_status as enum ('PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED', 'EXPIRED');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'event_type') then
    create type public.event_type as enum (
      'TRACK_STATUS_CHANGED', 'DISRUPTION_CREATED', 'DISRUPTION_ANALYSIS_REQUESTED',
      'DISRUPTION_ANALYSIS_COMPLETED', 'ROUTE_RECOMMENDED', 'TRAIN_STATUS_CHANGED',
      'TRAIN_AFFECTED', 'JOURNEY_STATUS_CHANGED', 'NETWORK_CHANGED'
    );
  else
    alter type public.event_type add value if not exists 'TRAIN_AFFECTED';
    alter type public.event_type add value if not exists 'JOURNEY_STATUS_CHANGED';
    alter type public.event_type add value if not exists 'NETWORK_CHANGED';
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'event_status') then
    create type public.event_status as enum ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
  end if;
end $$;

-- 3. Function to build physical regional node schema tables
create or replace function public.fn_setup_regional_physical_schema(p_schema text) returns void
language plpgsql as $$
begin
  execute format('create schema if not exists %I', p_schema);

  -- Regions table
  execute format('
    create table if not exists %I.regions (
      id uuid primary key default extensions.gen_random_uuid(),
      code text not null unique,
      name text not null,
      description text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', p_schema);

  -- Stations table
  execute format('
    drop table if exists %I.stations cascade;
    drop view if exists %I.stations cascade;
    create table if not exists %I.stations (
      id uuid primary key default extensions.gen_random_uuid(),
      station_code text not null unique,
      name text not null,
      region_id uuid not null,
      zone text,
      state text,
      latitude numeric(9,6) not null,
      longitude numeric(9,6) not null,
      geom extensions.geography(Point, 4326) not null,
      status public.station_status not null default ''ACTIVE''::public.station_status,
      data_source text not null default ''HANDCRAFTED'',
      source_record_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint stations_point_matches_%s check (extensions.ST_Equals(geom::extensions.geometry, extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geometry))
    )', p_schema, p_schema, p_schema, p_schema);

  -- Tracks table
  execute format('
    drop table if exists %I.tracks cascade;
    drop view if exists %I.tracks cascade;
    create table if not exists %I.tracks (
      id uuid primary key default extensions.gen_random_uuid(),
      from_station_id uuid not null,
      to_station_id uuid not null,
      region_id uuid not null,
      distance_km numeric(8,2) not null,
      track_type text not null,
      speed_limit_kmph integer not null,
      status public.track_status not null default ''ACTIVE''::public.track_status,
      geom extensions.geography(LineString, 4326) not null,
      valid_from timestamptz not null default now(),
      valid_to timestamptz,
      data_source text not null default ''HANDCRAFTED'',
      source_record_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint tracks_dir_unique_%s unique (from_station_id, to_station_id)
    )', p_schema, p_schema, p_schema, p_schema);

  -- Trains table
  execute format('
    drop table if exists %I.trains cascade;
    drop view if exists %I.trains cascade;
    create table if not exists %I.trains (
      id uuid primary key default extensions.gen_random_uuid(),
      train_number text not null unique,
      name text not null,
      train_type public.train_type not null,
      priority integer not null,
      source_station_id uuid not null,
      destination_station_id uuid not null,
      status public.train_status not null default ''SCHEDULED''::public.train_status,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', p_schema, p_schema, p_schema);

  -- Train Schedules table
  execute format('
    drop table if exists %I.train_schedules cascade;
    drop view if exists %I.train_schedules cascade;
    create table if not exists %I.train_schedules (
      id uuid primary key default extensions.gen_random_uuid(),
      train_id uuid not null,
      station_id uuid not null,
      stop_sequence integer not null,
      scheduled_arrival time,
      scheduled_departure time,
      day_offset integer not null default 0,
      platform text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint schedules_unique_%s unique (train_id, stop_sequence)
    )', p_schema, p_schema, p_schema, p_schema);

  -- Train Journeys table
  execute format('
    drop table if exists %I.train_journeys cascade;
    drop view if exists %I.train_journeys cascade;
    create table if not exists %I.train_journeys (
      id uuid primary key default extensions.gen_random_uuid(),
      train_id uuid not null,
      journey_date date not null,
      current_station_id uuid,
      next_station_id uuid,
      actual_arrival timestamptz,
      actual_departure timestamptz,
      delay_minutes integer not null default 0,
      journey_status public.journey_status not null default ''SCHEDULED''::public.journey_status,
      active_route jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint journeys_unique_%s unique (train_id, journey_date)
    )', p_schema, p_schema, p_schema, p_schema);

  -- Disruptions table
  execute format('
    drop table if exists %I.disruptions cascade;
    drop view if exists %I.disruptions cascade;
    create table if not exists %I.disruptions (
      id uuid primary key default extensions.gen_random_uuid(),
      type public.disruption_type not null,
      track_id uuid,
      station_id uuid,
      severity public.disruption_severity not null,
      reported_by text,
      description text,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      status public.disruption_status not null default ''OPEN''::public.disruption_status,
      analysis_status text not null default ''PENDING'',
      analyzed_at timestamptz,
      geom extensions.geography(Point, 4326),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', p_schema, p_schema, p_schema);

  -- Affected Trains table
  execute format('
    drop table if exists %I.affected_trains cascade;
    drop view if exists %I.affected_trains cascade;
    create table if not exists %I.affected_trains (
      id uuid primary key default extensions.gen_random_uuid(),
      disruption_id uuid not null,
      train_journey_id uuid not null,
      impact_type public.impact_type not null,
      estimated_delay_minutes integer not null default 0,
      status public.affected_train_status not null default ''PENDING''::public.affected_train_status,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint affected_unique_%s unique (disruption_id, train_journey_id)
    )', p_schema, p_schema, p_schema, p_schema);

  -- Route Recommendations table
  execute format('
    drop table if exists %I.route_recommendations cascade;
    drop view if exists %I.route_recommendations cascade;
    create table if not exists %I.route_recommendations (
      id uuid primary key default extensions.gen_random_uuid(),
      disruption_id uuid not null,
      train_journey_id uuid not null,
      original_route jsonb not null,
      recommended_route jsonb not null,
      distance_km numeric(8,2) not null,
      estimated_travel_minutes integer not null,
      estimated_delay_minutes integer not null,
      score numeric(10,4) not null,
      status public.recommendation_status not null default ''PROPOSED''::public.recommendation_status,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint recommendation_affected_pair_fk_%s foreign key (disruption_id, train_journey_id) references %I.affected_trains(disruption_id, train_journey_id) on delete cascade
    )', p_schema, p_schema, p_schema, p_schema, p_schema);

  -- Event Log table
  execute format('
    drop table if exists %I.event_log cascade;
    drop view if exists %I.event_log cascade;
    create table if not exists %I.event_log (
      id uuid primary key default extensions.gen_random_uuid(),
      event_type public.event_type not null,
      entity_type text not null,
      entity_id uuid not null,
      payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      processed_at timestamptz,
      status public.event_status not null default ''PENDING''::public.event_status,
      event_sequence bigserial,
      attempts integer not null default 0,
      available_at timestamptz not null default now(),
      locked_at timestamptz,
      lock_token uuid,
      last_error text
    )', p_schema, p_schema, p_schema);

  -- History tables
  execute format('
    drop table if exists %I.journey_status_history cascade;
    create table if not exists %I.journey_status_history (
    id uuid primary key default extensions.gen_random_uuid(), train_journey_id uuid not null,
    old_status public.journey_status, new_status public.journey_status not null,
    changed_at timestamptz not null default now(), changed_by text, reason text
  )', p_schema, p_schema);

  execute format('
    drop table if exists %I.track_status_history cascade;
    create table if not exists %I.track_status_history (
    id uuid primary key default extensions.gen_random_uuid(), track_id uuid not null,
    old_status public.track_status, new_status public.track_status not null,
    changed_at timestamptz not null default now(), changed_by text, reason text
  )', p_schema, p_schema);

  execute format('
    drop table if exists %I.train_status_history cascade;
    create table if not exists %I.train_status_history (
    id uuid primary key default extensions.gen_random_uuid(), train_id uuid not null,
    old_status public.train_status, new_status public.train_status not null,
    changed_at timestamptz not null default now(), changed_by text, reason text
  )', p_schema, p_schema);

  execute format('
    drop table if exists %I.journey_delay_history cascade;
    create table if not exists %I.journey_delay_history (
    id uuid primary key default extensions.gen_random_uuid(), train_journey_id uuid not null,
    old_delay_minutes integer, new_delay_minutes integer not null,
    changed_at timestamptz not null default now(), changed_by text, reason text
  )', p_schema, p_schema);

  execute format('
    drop table if exists %I.disruption_history cascade;
    create table if not exists %I.disruption_history (
    id uuid primary key default extensions.gen_random_uuid(), disruption_id uuid not null,
    old_status public.disruption_status, new_status public.disruption_status not null,
    changed_at timestamptz not null default now(), changed_by text, reason text
  )', p_schema, p_schema);

  -- Import metadata tables
  execute format('
    drop table if exists %I.import_batches cascade;
    create table if not exists %I.import_batches (
    id uuid primary key default extensions.gen_random_uuid(), source_name text not null, source_url text,
    source_license text not null, source_checksum text not null unique, status text not null,
    stations_imported integer not null default 0, tracks_imported integer not null default 0,
    trains_imported integer not null default 0, started_at timestamptz not null default now(), completed_at timestamptz,
    error_summary text
  )', p_schema, p_schema);

  execute format('
    drop table if exists %I.import_rejections cascade;
    create table if not exists %I.import_rejections (
    id uuid primary key default extensions.gen_random_uuid(), batch_id uuid not null,
    record_type text not null, source_record_id text, reason text not null, payload jsonb not null, created_at timestamptz not null default now()
  )', p_schema, p_schema);

  -- Core relational, spatial, and history indexes on physical regional tables
  execute format('create index if not exists idx_stations_region_id_%s on %I.stations(region_id)', p_schema, p_schema);
  execute format('create index if not exists idx_stations_status_%s on %I.stations(status)', p_schema, p_schema);
  execute format('create index if not exists idx_stations_geom_gist on %I.stations using gist (geom)', p_schema);

  execute format('create index if not exists idx_tracks_from_station_id_%s on %I.tracks(from_station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_tracks_to_station_id_%s on %I.tracks(to_station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_tracks_region_id_%s on %I.tracks(region_id)', p_schema, p_schema);
  execute format('create index if not exists idx_tracks_status_%s on %I.tracks(status)', p_schema, p_schema);
  execute format('create index if not exists idx_tracks_valid_window_%s on %I.tracks(valid_from, valid_to)', p_schema, p_schema);
  execute format('create index if not exists idx_tracks_geom_gist on %I.tracks using gist (geom)', p_schema);

  execute format('create index if not exists idx_trains_source_station_id_%s on %I.trains(source_station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_trains_destination_station_id_%s on %I.trains(destination_station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_trains_status_%s on %I.trains(status)', p_schema, p_schema);

  execute format('create index if not exists idx_train_schedules_train_id_%s on %I.train_schedules(train_id)', p_schema, p_schema);
  execute format('create index if not exists idx_train_schedules_station_id_%s on %I.train_schedules(station_id)', p_schema, p_schema);

  execute format('create index if not exists idx_train_journeys_train_id_%s on %I.train_journeys(train_id)', p_schema, p_schema);
  execute format('create index if not exists idx_train_journeys_current_station_id_%s on %I.train_journeys(current_station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_train_journeys_next_station_id_%s on %I.train_journeys(next_station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_train_journeys_status_date on %I.train_journeys(journey_status, journey_date)', p_schema);

  execute format('create index if not exists idx_disruptions_track_id_%s on %I.disruptions(track_id)', p_schema, p_schema);
  execute format('create index if not exists idx_disruptions_station_id_%s on %I.disruptions(station_id)', p_schema, p_schema);
  execute format('create index if not exists idx_disruptions_status_started_at on %I.disruptions(status, started_at)', p_schema);
  execute format('create index if not exists idx_disruptions_geom_gist on %I.disruptions using gist (geom)', p_schema);

  execute format('create index if not exists idx_affected_trains_disruption_id_%s on %I.affected_trains(disruption_id)', p_schema, p_schema);
  execute format('create index if not exists idx_affected_trains_train_journey_id_%s on %I.affected_trains(train_journey_id)', p_schema, p_schema);

  execute format('create index if not exists idx_route_recommendations_disruption_id_%s on %I.route_recommendations(disruption_id)', p_schema, p_schema);
  execute format('create index if not exists idx_route_recommendations_train_journey_id_%s on %I.route_recommendations(train_journey_id)', p_schema, p_schema);
  execute format('create index if not exists idx_route_recommendations_status_%s on %I.route_recommendations(status)', p_schema, p_schema);

  execute format('create index if not exists idx_event_log_status_created_at on %I.event_log(status, created_at)', p_schema);
  execute format('create index if not exists idx_event_log_event_type_%s on %I.event_log(event_type)', p_schema, p_schema);

  execute format('create index if not exists idx_track_status_history_track_changed_%s on %I.track_status_history(track_id, changed_at)', p_schema, p_schema);
  execute format('create index if not exists idx_train_status_history_train_changed_%s on %I.train_status_history(train_id, changed_at)', p_schema, p_schema);
  execute format('create index if not exists idx_journey_delay_history_journey_changed_%s on %I.journey_delay_history(train_journey_id, changed_at)', p_schema, p_schema);
  execute format('create index if not exists idx_disruption_history_disruption_changed_%s on %I.disruption_history(disruption_id, changed_at)', p_schema, p_schema);

end $$;

-- Run physical schema setup for regional nodes
select public.fn_setup_regional_physical_schema('railway_south');
select public.fn_setup_regional_physical_schema('railway_central');
select public.fn_setup_regional_physical_schema('railway_north');

-- 4. Copy existing data from railway_main if it exists before dropping
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'railway_main') then
    -- Copy regions
    insert into railway_south.regions select * from railway_main.regions on conflict (code) do nothing;
    insert into railway_central.regions select * from railway_main.regions on conflict (code) do nothing;
    insert into railway_north.regions select * from railway_main.regions on conflict (code) do nothing;

    -- Copy stations
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'stations' and table_type = 'BASE TABLE') then
      insert into railway_south.stations (id, station_code, name, region_id, zone, state, latitude, longitude, geom, status, created_at, updated_at)
        select s.id, s.station_code, s.name, s.region_id, s.zone, s.state, s.latitude, s.longitude, s.geom, s.status::text::public.station_status, s.created_at, s.updated_at
        from railway_main.stations s join railway_main.regions r on r.id = s.region_id where r.code = 'SR'
        on conflict (station_code) do update set status = excluded.status;

      insert into railway_central.stations (id, station_code, name, region_id, zone, state, latitude, longitude, geom, status, created_at, updated_at)
        select s.id, s.station_code, s.name, s.region_id, s.zone, s.state, s.latitude, s.longitude, s.geom, s.status::text::public.station_status, s.created_at, s.updated_at
        from railway_main.stations s join railway_main.regions r on r.id = s.region_id where r.code = 'CR'
        on conflict (station_code) do update set status = excluded.status;

      insert into railway_north.stations (id, station_code, name, region_id, zone, state, latitude, longitude, geom, status, created_at, updated_at)
        select s.id, s.station_code, s.name, s.region_id, s.zone, s.state, s.latitude, s.longitude, s.geom, s.status::text::public.station_status, s.created_at, s.updated_at
        from railway_main.stations s join railway_main.regions r on r.id = s.region_id where r.code = 'NR'
        on conflict (station_code) do update set status = excluded.status;
    end if;

    -- Copy tracks
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'tracks' and table_type = 'BASE TABLE') then
      insert into railway_south.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom, valid_from, valid_to, created_at, updated_at)
        select t.id, t.from_station_id, t.to_station_id, t.region_id, t.distance_km, t.track_type, t.speed_limit_kmph, t.status::text::public.track_status, t.geom, t.valid_from, t.valid_to, t.created_at, t.updated_at
        from railway_main.tracks t join railway_main.regions r on r.id = t.region_id where r.code = 'SR'
        on conflict (from_station_id, to_station_id) do update set status = excluded.status;

      insert into railway_central.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom, valid_from, valid_to, created_at, updated_at)
        select t.id, t.from_station_id, t.to_station_id, t.region_id, t.distance_km, t.track_type, t.speed_limit_kmph, t.status::text::public.track_status, t.geom, t.valid_from, t.valid_to, t.created_at, t.updated_at
        from railway_main.tracks t join railway_main.regions r on r.id = t.region_id where r.code = 'CR'
        on conflict (from_station_id, to_station_id) do update set status = excluded.status;

      insert into railway_north.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom, valid_from, valid_to, created_at, updated_at)
        select t.id, t.from_station_id, t.to_station_id, t.region_id, t.distance_km, t.track_type, t.speed_limit_kmph, t.status::text::public.track_status, t.geom, t.valid_from, t.valid_to, t.created_at, t.updated_at
        from railway_main.tracks t join railway_main.regions r on r.id = t.region_id where r.code = 'NR'
        on conflict (from_station_id, to_station_id) do update set status = excluded.status;
    end if;

    -- Copy trains
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'trains' and table_type = 'BASE TABLE') then
      insert into railway_south.trains (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status, created_at, updated_at)
        select tr.id, tr.train_number, tr.name, tr.train_type::text::public.train_type, tr.priority, tr.source_station_id, tr.destination_station_id, tr.status::text::public.train_status, tr.created_at, tr.updated_at
        from railway_main.trains tr join railway_main.stations s on s.id = tr.source_station_id join railway_main.regions r on r.id = s.region_id where r.code = 'SR'
        on conflict (train_number) do update set status = excluded.status;

      insert into railway_central.trains (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status, created_at, updated_at)
        select tr.id, tr.train_number, tr.name, tr.train_type::text::public.train_type, tr.priority, tr.source_station_id, tr.destination_station_id, tr.status::text::public.train_status, tr.created_at, tr.updated_at
        from railway_main.trains tr join railway_main.stations s on s.id = tr.source_station_id join railway_main.regions r on r.id = s.region_id where r.code = 'CR'
        on conflict (train_number) do update set status = excluded.status;

      insert into railway_north.trains (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status, created_at, updated_at)
        select tr.id, tr.train_number, tr.name, tr.train_type::text::public.train_type, tr.priority, tr.source_station_id, tr.destination_station_id, tr.status::text::public.train_status, tr.created_at, tr.updated_at
        from railway_main.trains tr join railway_main.stations s on s.id = tr.source_station_id join railway_main.regions r on r.id = s.region_id where r.code = 'NR'
        on conflict (train_number) do update set status = excluded.status;
    end if;

    -- Copy train schedules
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'train_schedules' and table_type = 'BASE TABLE') then
      insert into railway_south.train_schedules (id, train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform, created_at, updated_at)
        select sch.id, sch.train_id, sch.station_id, sch.stop_sequence, sch.scheduled_arrival, sch.scheduled_departure, sch.day_offset, sch.platform, sch.created_at, sch.updated_at
        from railway_main.train_schedules sch join railway_main.stations s on s.id = sch.station_id join railway_main.regions r on r.id = s.region_id where r.code = 'SR'
        on conflict (train_id, stop_sequence) do update set platform = excluded.platform;

      insert into railway_central.train_schedules (id, train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform, created_at, updated_at)
        select sch.id, sch.train_id, sch.station_id, sch.stop_sequence, sch.scheduled_arrival, sch.scheduled_departure, sch.day_offset, sch.platform, sch.created_at, sch.updated_at
        from railway_main.train_schedules sch join railway_main.stations s on s.id = sch.station_id join railway_main.regions r on r.id = s.region_id where r.code = 'CR'
        on conflict (train_id, stop_sequence) do update set platform = excluded.platform;

      insert into railway_north.train_schedules (id, train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform, created_at, updated_at)
        select sch.id, sch.train_id, sch.station_id, sch.stop_sequence, sch.scheduled_arrival, sch.scheduled_departure, sch.day_offset, sch.platform, sch.created_at, sch.updated_at
        from railway_main.train_schedules sch join railway_main.stations s on s.id = sch.station_id join railway_main.regions r on r.id = s.region_id where r.code = 'NR'
        on conflict (train_id, stop_sequence) do update set platform = excluded.platform;
    end if;

    -- Copy train journeys
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'train_journeys' and table_type = 'BASE TABLE') then
      insert into railway_south.train_journeys (id, train_id, journey_date, current_station_id, next_station_id, actual_arrival, actual_departure, delay_minutes, journey_status, active_route, created_at, updated_at)
        select id, train_id, journey_date, current_station_id, next_station_id, actual_arrival, actual_departure, delay_minutes, journey_status::text::public.journey_status, active_route, created_at, updated_at from railway_main.train_journeys on conflict do nothing;
    end if;

    -- Copy disruptions
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'disruptions' and table_type = 'BASE TABLE') then
      insert into railway_south.disruptions (id, type, track_id, station_id, severity, reported_by, description, started_at, ended_at, status, analysis_status, analyzed_at, geom, created_at, updated_at)
        select id, type::text::public.disruption_type, track_id, station_id, severity::text::public.disruption_severity, reported_by, description, started_at, ended_at, status::text::public.disruption_status, analysis_status, analyzed_at, geom, created_at, updated_at from railway_main.disruptions on conflict do nothing;
    end if;

    -- Copy affected trains
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'affected_trains' and table_type = 'BASE TABLE') then
      insert into railway_south.affected_trains (id, disruption_id, train_journey_id, impact_type, estimated_delay_minutes, status, created_at, updated_at)
        select id, disruption_id, train_journey_id, impact_type::text::public.impact_type, estimated_delay_minutes, status::text::public.affected_train_status, created_at, updated_at from railway_main.affected_trains on conflict do nothing;
    end if;

    -- Copy route recommendations
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'route_recommendations' and table_type = 'BASE TABLE') then
      insert into railway_south.route_recommendations (id, disruption_id, train_journey_id, original_route, recommended_route, distance_km, estimated_travel_minutes, estimated_delay_minutes, score, status, created_at, updated_at)
        select id, disruption_id, train_journey_id, original_route, recommended_route, distance_km, estimated_travel_minutes, estimated_delay_minutes, score, status::text::public.recommendation_status, created_at, updated_at from railway_main.route_recommendations on conflict do nothing;
    end if;

    -- Copy event log
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'event_log' and table_type = 'BASE TABLE') then
      insert into railway_south.event_log (id, event_type, entity_type, entity_id, payload, created_at, processed_at, status, attempts, available_at, locked_at, lock_token, last_error)
        select id, event_type::text::public.event_type, entity_type, entity_id, payload, created_at, processed_at, status::text::public.event_status, attempts, available_at, locked_at, lock_token, last_error from railway_main.event_log on conflict do nothing;
    end if;

    -- Copy history tables
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'track_status_history' and table_type = 'BASE TABLE') then
      insert into railway_south.track_status_history (id, track_id, old_status, new_status, changed_at, changed_by)
        select id, track_id, old_status::text::public.track_status, new_status::text::public.track_status, changed_at, changed_by from railway_main.track_status_history on conflict do nothing;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'train_status_history' and table_type = 'BASE TABLE') then
      insert into railway_south.train_status_history (id, train_id, old_status, new_status, changed_at, changed_by)
        select id, train_id, old_status::text::public.train_status, new_status::text::public.train_status, changed_at, changed_by from railway_main.train_status_history on conflict do nothing;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'journey_status_history' and table_type = 'BASE TABLE') then
      insert into railway_south.journey_status_history (id, train_journey_id, old_status, new_status, changed_at, changed_by)
        select id, train_journey_id, old_status::text::public.journey_status, new_status::text::public.journey_status, changed_at, changed_by from railway_main.journey_status_history on conflict do nothing;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'journey_delay_history' and table_type = 'BASE TABLE') then
      insert into railway_south.journey_delay_history (id, train_journey_id, old_delay_minutes, new_delay_minutes, changed_at, changed_by)
        select id, train_journey_id, old_delay_minutes, new_delay_minutes, changed_at, changed_by from railway_main.journey_delay_history on conflict do nothing;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'railway_main' and table_name = 'disruption_history' and table_type = 'BASE TABLE') then
      insert into railway_south.disruption_history (id, disruption_id, old_status, new_status, changed_at, changed_by)
        select id, disruption_id, old_status::text::public.disruption_status, new_status::text::public.disruption_status, changed_at, changed_by from railway_main.disruption_history on conflict do nothing;
    end if;

  end if;
end $$;

-- 5. Unified Scatter-Gather Views in public schema
create or replace view public.regions as select * from railway_south.regions;

create or replace view public.stations as
select * from railway_south.stations
union all select * from railway_central.stations
union all select * from railway_north.stations;

create or replace view public.tracks as
select * from railway_south.tracks
union all select * from railway_central.tracks
union all select * from railway_north.tracks;

create or replace view public.trains as
select * from railway_south.trains
union all select * from railway_central.trains
union all select * from railway_north.trains;

create or replace view public.train_schedules as
select * from railway_south.train_schedules
union all select * from railway_central.train_schedules
union all select * from railway_north.train_schedules;

create or replace view public.train_journeys as
select * from railway_south.train_journeys
union all select * from railway_central.train_journeys
union all select * from railway_north.train_journeys;

create or replace view public.disruptions as
select * from railway_south.disruptions
union all select * from railway_central.disruptions
union all select * from railway_north.disruptions;

create or replace view public.affected_trains as
select * from railway_south.affected_trains
union all select * from railway_central.affected_trains
union all select * from railway_north.affected_trains;

create or replace view public.route_recommendations as
select * from railway_south.route_recommendations
union all select * from railway_central.route_recommendations
union all select * from railway_north.route_recommendations;

create or replace view public.event_log as
select * from railway_south.event_log
union all select * from railway_central.event_log
union all select * from railway_north.event_log;

create or replace view public.track_status_history as
select * from railway_south.track_status_history
union all select * from railway_central.track_status_history
union all select * from railway_north.track_status_history;

create or replace view public.train_status_history as
select * from railway_south.train_status_history
union all select * from railway_central.train_status_history
union all select * from railway_north.train_status_history;

create or replace view public.journey_status_history as
select * from railway_south.journey_status_history
union all select * from railway_central.journey_status_history
union all select * from railway_north.journey_status_history;

create or replace view public.journey_delay_history as
select * from railway_south.journey_delay_history
union all select * from railway_central.journey_delay_history
union all select * from railway_north.journey_delay_history;

create or replace view public.disruption_history as
select * from railway_south.disruption_history
union all select * from railway_central.disruption_history
union all select * from railway_north.disruption_history;

create or replace view public.import_batches as
select * from railway_south.import_batches
union all select * from railway_central.import_batches
union all select * from railway_north.import_batches;

create or replace view public.import_rejections as
select * from railway_south.import_rejections
union all select * from railway_central.import_rejections
union all select * from railway_north.import_rejections;

-- 5.1 INSTEAD OF Triggers to make scatter-gather views fully writable and route writes directly to regional physical node tables
create or replace function public.trg_instead_of_public_write() returns trigger
language plpgsql set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
declare
  reg_code text;
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'stations' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.status := coalesce(new.status, 'ACTIVE'::public.station_status);
      new.data_source := coalesce(new.data_source, 'HANDCRAFTED');
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select code into reg_code from public.regions where id = new.region_id;
      if reg_code = 'CR' then
        insert into railway_central.stations values (new.*) on conflict (station_code) do update set name=excluded.name, state=coalesce(excluded.state, railway_central.stations.state), latitude=excluded.latitude, longitude=excluded.longitude, geom=excluded.geom, status=excluded.status, data_source=excluded.data_source, source_record_id=excluded.source_record_id;
      elsif reg_code = 'NR' then
        insert into railway_north.stations values (new.*) on conflict (station_code) do update set name=excluded.name, state=coalesce(excluded.state, railway_north.stations.state), latitude=excluded.latitude, longitude=excluded.longitude, geom=excluded.geom, status=excluded.status, data_source=excluded.data_source, source_record_id=excluded.source_record_id;
      else
        insert into railway_south.stations values (new.*) on conflict (station_code) do update set name=excluded.name, state=coalesce(excluded.state, railway_south.stations.state), latitude=excluded.latitude, longitude=excluded.longitude, geom=excluded.geom, status=excluded.status, data_source=excluded.data_source, source_record_id=excluded.source_record_id;
      end if;
      return new;
    elsif tg_table_name = 'tracks' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.status := coalesce(new.status, 'ACTIVE'::public.track_status);
      new.valid_from := coalesce(new.valid_from, clock_timestamp());
      new.data_source := coalesce(new.data_source, 'HANDCRAFTED');
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select code into reg_code from public.regions where id = new.region_id;
      if reg_code = 'CR' then
        insert into railway_central.tracks values (new.*) on conflict (from_station_id,to_station_id) do update set status=excluded.status, distance_km=excluded.distance_km, speed_limit_kmph=excluded.speed_limit_kmph, geom=excluded.geom;
      elsif reg_code = 'NR' then
        insert into railway_north.tracks values (new.*) on conflict (from_station_id,to_station_id) do update set status=excluded.status, distance_km=excluded.distance_km, speed_limit_kmph=excluded.speed_limit_kmph, geom=excluded.geom;
      else
        insert into railway_south.tracks values (new.*) on conflict (from_station_id,to_station_id) do update set status=excluded.status, distance_km=excluded.distance_km, speed_limit_kmph=excluded.speed_limit_kmph, geom=excluded.geom;
      end if;
      return new;
    elsif tg_table_name = 'trains' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.status := coalesce(new.status, 'SCHEDULED'::public.train_status);
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select r.code into reg_code from public.stations s join public.regions r on r.id = s.region_id where s.id = new.source_station_id;
      if reg_code = 'CR' then
        insert into railway_central.trains values (new.*) on conflict (train_number) do update set name=excluded.name, train_type=excluded.train_type, priority=excluded.priority, source_station_id=excluded.source_station_id, destination_station_id=excluded.destination_station_id, status=excluded.status;
      elsif reg_code = 'NR' then
        insert into railway_north.trains values (new.*) on conflict (train_number) do update set name=excluded.name, train_type=excluded.train_type, priority=excluded.priority, source_station_id=excluded.source_station_id, destination_station_id=excluded.destination_station_id, status=excluded.status;
      else
        insert into railway_south.trains values (new.*) on conflict (train_number) do update set name=excluded.name, train_type=excluded.train_type, priority=excluded.priority, source_station_id=excluded.source_station_id, destination_station_id=excluded.destination_station_id, status=excluded.status;
      end if;
      return new;
    elsif tg_table_name = 'train_schedules' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.day_offset := coalesce(new.day_offset, 0);
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select r.code into reg_code from public.stations s join public.regions r on r.id = s.region_id where s.id = new.station_id;
      if reg_code = 'CR' then
        insert into railway_central.train_schedules values (new.*) on conflict (train_id,stop_sequence) do update set station_id=excluded.station_id, platform=excluded.platform;
      elsif reg_code = 'NR' then
        insert into railway_north.train_schedules values (new.*) on conflict (train_id,stop_sequence) do update set station_id=excluded.station_id, platform=excluded.platform;
      else
        insert into railway_south.train_schedules values (new.*) on conflict (train_id,stop_sequence) do update set station_id=excluded.station_id, platform=excluded.platform;
      end if;
      return new;
    elsif tg_table_name = 'train_journeys' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.delay_minutes := coalesce(new.delay_minutes, 0);
      new.journey_status := coalesce(new.journey_status, 'SCHEDULED'::public.journey_status);
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select r.code into reg_code from public.trains t join public.stations s on s.id = t.source_station_id join public.regions r on r.id = s.region_id where t.id = new.train_id;
      if reg_code = 'CR' then
        insert into railway_central.train_journeys values (new.*) on conflict (train_id,journey_date) do update set journey_status=excluded.journey_status;
      elsif reg_code = 'NR' then
        insert into railway_north.train_journeys values (new.*) on conflict (train_id,journey_date) do update set journey_status=excluded.journey_status;
      else
        insert into railway_south.train_journeys values (new.*) on conflict (train_id,journey_date) do update set journey_status=excluded.journey_status;
      end if;
      return new;
    elsif tg_table_name = 'disruptions' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.started_at := coalesce(new.started_at, clock_timestamp());
      new.status := coalesce(new.status, 'OPEN'::public.disruption_status);
      new.analysis_status := coalesce(new.analysis_status, 'PENDING');
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      if new.track_id is not null then
        select r.code into reg_code from public.tracks t join public.regions r on r.id = t.region_id where t.id = new.track_id;
      elsif new.station_id is not null then
        select r.code into reg_code from public.stations s join public.regions r on r.id = s.region_id where s.id = new.station_id;
      end if;
      if reg_code = 'CR' then
        insert into railway_central.disruptions values (new.*);
      elsif reg_code = 'NR' then
        insert into railway_north.disruptions values (new.*);
      else
        insert into railway_south.disruptions values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'affected_trains' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.estimated_delay_minutes := coalesce(new.estimated_delay_minutes, 0);
      new.status := coalesce(new.status, 'PENDING'::public.affected_train_status);
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select r.code into reg_code from public.disruptions d left join public.tracks t on t.id = d.track_id left join public.stations s on s.id = coalesce(t.from_station_id, d.station_id) join public.regions r on r.id = s.region_id where d.id = new.disruption_id;
      if reg_code = 'CR' then
        insert into railway_central.affected_trains values (new.*) on conflict (disruption_id,train_journey_id) do update set status=excluded.status, impact_type=excluded.impact_type, estimated_delay_minutes=excluded.estimated_delay_minutes;
      elsif reg_code = 'NR' then
        insert into railway_north.affected_trains values (new.*) on conflict (disruption_id,train_journey_id) do update set status=excluded.status, impact_type=excluded.impact_type, estimated_delay_minutes=excluded.estimated_delay_minutes;
      else
        insert into railway_south.affected_trains values (new.*) on conflict (disruption_id,train_journey_id) do update set status=excluded.status, impact_type=excluded.impact_type, estimated_delay_minutes=excluded.estimated_delay_minutes;
      end if;
      return new;
    elsif tg_table_name = 'route_recommendations' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.status := coalesce(new.status, 'PROPOSED'::public.recommendation_status);
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.updated_at := coalesce(new.updated_at, clock_timestamp());
      select r.code into reg_code from public.disruptions d left join public.tracks t on t.id = d.track_id left join public.stations s on s.id = coalesce(t.from_station_id, d.station_id) join public.regions r on r.id = s.region_id where d.id = new.disruption_id;
      if reg_code = 'CR' then
        insert into railway_central.route_recommendations values (new.*);
      elsif reg_code = 'NR' then
        insert into railway_north.route_recommendations values (new.*);
      else
        insert into railway_south.route_recommendations values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'event_log' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.payload := coalesce(new.payload, '{}'::jsonb);
      new.created_at := coalesce(new.created_at, clock_timestamp());
      new.status := coalesce(new.status, 'PENDING'::public.event_status);
      new.attempts := coalesce(new.attempts, 0);
      new.available_at := coalesce(new.available_at, clock_timestamp());
      if new.event_sequence is null then
        if exists(select 1 from railway_central.disruptions where id = new.entity_id) or exists(select 1 from railway_central.train_journeys where id = new.entity_id) or exists(select 1 from railway_central.tracks where id = new.entity_id) then
          insert into railway_central.event_log(id, event_type, entity_type, entity_id, payload, created_at, processed_at, status, attempts, available_at, locked_at, lock_token, last_error)
          values (new.id, new.event_type, new.entity_type, new.entity_id, new.payload, new.created_at, new.processed_at, new.status, new.attempts, new.available_at, new.locked_at, new.lock_token, new.last_error);
        elsif exists(select 1 from railway_north.disruptions where id = new.entity_id) or exists(select 1 from railway_north.train_journeys where id = new.entity_id) or exists(select 1 from railway_north.tracks where id = new.entity_id) then
          insert into railway_north.event_log(id, event_type, entity_type, entity_id, payload, created_at, processed_at, status, attempts, available_at, locked_at, lock_token, last_error)
          values (new.id, new.event_type, new.entity_type, new.entity_id, new.payload, new.created_at, new.processed_at, new.status, new.attempts, new.available_at, new.locked_at, new.lock_token, new.last_error);
        else
          insert into railway_south.event_log(id, event_type, entity_type, entity_id, payload, created_at, processed_at, status, attempts, available_at, locked_at, lock_token, last_error)
          values (new.id, new.event_type, new.entity_type, new.entity_id, new.payload, new.created_at, new.processed_at, new.status, new.attempts, new.available_at, new.locked_at, new.lock_token, new.last_error);
        end if;
      else
        if exists(select 1 from railway_central.disruptions where id = new.entity_id) or exists(select 1 from railway_central.train_journeys where id = new.entity_id) or exists(select 1 from railway_central.tracks where id = new.entity_id) then
          insert into railway_central.event_log values (new.*);
        elsif exists(select 1 from railway_north.disruptions where id = new.entity_id) or exists(select 1 from railway_north.train_journeys where id = new.entity_id) or exists(select 1 from railway_north.tracks where id = new.entity_id) then
          insert into railway_north.event_log values (new.*);
        else
          insert into railway_south.event_log values (new.*);
        end if;
      end if;
      return new;
    elsif tg_table_name = 'track_status_history' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.changed_at := coalesce(new.changed_at, clock_timestamp());
      if exists(select 1 from railway_central.tracks where id = new.track_id) then
        insert into railway_central.track_status_history values (new.*);
      elsif exists(select 1 from railway_north.tracks where id = new.track_id) then
        insert into railway_north.track_status_history values (new.*);
      else
        insert into railway_south.track_status_history values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'train_status_history' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.changed_at := coalesce(new.changed_at, clock_timestamp());
      if exists(select 1 from railway_central.trains where id = new.train_id) then
        insert into railway_central.train_status_history values (new.*);
      elsif exists(select 1 from railway_north.trains where id = new.train_id) then
        insert into railway_north.train_status_history values (new.*);
      else
        insert into railway_south.train_status_history values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'journey_status_history' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.changed_at := coalesce(new.changed_at, clock_timestamp());
      if exists(select 1 from railway_central.train_journeys where id = new.train_journey_id) then
        insert into railway_central.journey_status_history values (new.*);
      elsif exists(select 1 from railway_north.train_journeys where id = new.train_journey_id) then
        insert into railway_north.journey_status_history values (new.*);
      else
        insert into railway_south.journey_status_history values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'journey_delay_history' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.changed_at := coalesce(new.changed_at, clock_timestamp());
      if exists(select 1 from railway_central.train_journeys where id = new.train_journey_id) then
        insert into railway_central.journey_delay_history values (new.*);
      elsif exists(select 1 from railway_north.train_journeys where id = new.train_journey_id) then
        insert into railway_north.journey_delay_history values (new.*);
      else
        insert into railway_south.journey_delay_history values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'disruption_history' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.changed_at := coalesce(new.changed_at, clock_timestamp());
      if exists(select 1 from railway_central.disruptions where id = new.disruption_id) then
        insert into railway_central.disruption_history values (new.*);
      elsif exists(select 1 from railway_north.disruptions where id = new.disruption_id) then
        insert into railway_north.disruption_history values (new.*);
      else
        insert into railway_south.disruption_history values (new.*);
      end if;
      return new;
    elsif tg_table_name = 'import_batches' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.started_at := coalesce(new.started_at, clock_timestamp());
      new.stations_imported := coalesce(new.stations_imported, 0);
      new.tracks_imported := coalesce(new.tracks_imported, 0);
      new.trains_imported := coalesce(new.trains_imported, 0);
      insert into railway_south.import_batches (id, source_name, source_url, source_license, source_checksum, status, stations_imported, tracks_imported, trains_imported, started_at, completed_at, error_summary)
      values (new.id, new.source_name, new.source_url, new.source_license, new.source_checksum, new.status, coalesce(new.stations_imported, 0), coalesce(new.tracks_imported, 0), coalesce(new.trains_imported, 0), coalesce(new.started_at, clock_timestamp()), new.completed_at, new.error_summary);
      return new;
    elsif tg_table_name = 'import_rejections' then
      new.id := coalesce(new.id, extensions.gen_random_uuid());
      new.created_at := coalesce(new.created_at, clock_timestamp());
      insert into railway_south.import_rejections (id, batch_id, record_type, source_record_id, reason, payload, created_at)
      values (new.id, new.batch_id, new.record_type, new.source_record_id, new.reason, new.payload, coalesce(new.created_at, clock_timestamp()));
      return new;
    end if;

  elsif tg_op = 'UPDATE' then
    if tg_table_name = 'stations' then
      update railway_south.stations set name=new.name, zone=new.zone, state=new.state, latitude=new.latitude, longitude=new.longitude, geom=new.geom, status=new.status, updated_at=clock_timestamp() where id = old.id;
      update railway_central.stations set name=new.name, zone=new.zone, state=new.state, latitude=new.latitude, longitude=new.longitude, geom=new.geom, status=new.status, updated_at=clock_timestamp() where id = old.id;
      update railway_north.stations set name=new.name, zone=new.zone, state=new.state, latitude=new.latitude, longitude=new.longitude, geom=new.geom, status=new.status, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'tracks' then
      update railway_south.tracks set distance_km=new.distance_km, track_type=new.track_type, speed_limit_kmph=new.speed_limit_kmph, status=new.status, geom=new.geom, valid_from=new.valid_from, valid_to=new.valid_to, updated_at=clock_timestamp() where id = old.id;
      update railway_central.tracks set distance_km=new.distance_km, track_type=new.track_type, speed_limit_kmph=new.speed_limit_kmph, status=new.status, geom=new.geom, valid_from=new.valid_from, valid_to=new.valid_to, updated_at=clock_timestamp() where id = old.id;
      update railway_north.tracks set distance_km=new.distance_km, track_type=new.track_type, speed_limit_kmph=new.speed_limit_kmph, status=new.status, geom=new.geom, valid_from=new.valid_from, valid_to=new.valid_to, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'trains' then
      update railway_south.trains set name=new.name, train_type=new.train_type, priority=new.priority, status=new.status, updated_at=clock_timestamp() where id = old.id;
      update railway_central.trains set name=new.name, train_type=new.train_type, priority=new.priority, status=new.status, updated_at=clock_timestamp() where id = old.id;
      update railway_north.trains set name=new.name, train_type=new.train_type, priority=new.priority, status=new.status, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'train_schedules' then
      update railway_south.train_schedules set stop_sequence=new.stop_sequence, scheduled_arrival=new.scheduled_arrival, scheduled_departure=new.scheduled_departure, day_offset=new.day_offset, platform=new.platform, updated_at=clock_timestamp() where id = old.id;
      update railway_central.train_schedules set stop_sequence=new.stop_sequence, scheduled_arrival=new.scheduled_arrival, scheduled_departure=new.scheduled_departure, day_offset=new.day_offset, platform=new.platform, updated_at=clock_timestamp() where id = old.id;
      update railway_north.train_schedules set stop_sequence=new.stop_sequence, scheduled_arrival=new.scheduled_arrival, scheduled_departure=new.scheduled_departure, day_offset=new.day_offset, platform=new.platform, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'train_journeys' then
      update railway_south.train_journeys set current_station_id=new.current_station_id, next_station_id=new.next_station_id, actual_arrival=new.actual_arrival, actual_departure=new.actual_departure, delay_minutes=new.delay_minutes, journey_status=new.journey_status, active_route=new.active_route, updated_at=clock_timestamp() where id = old.id;
      update railway_central.train_journeys set current_station_id=new.current_station_id, next_station_id=new.next_station_id, actual_arrival=new.actual_arrival, actual_departure=new.actual_departure, delay_minutes=new.delay_minutes, journey_status=new.journey_status, active_route=new.active_route, updated_at=clock_timestamp() where id = old.id;
      update railway_north.train_journeys set current_station_id=new.current_station_id, next_station_id=new.next_station_id, actual_arrival=new.actual_arrival, actual_departure=new.actual_departure, delay_minutes=new.delay_minutes, journey_status=new.journey_status, active_route=new.active_route, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'disruptions' then
      update railway_south.disruptions set type=new.type, track_id=new.track_id, station_id=new.station_id, severity=new.severity, reported_by=new.reported_by, description=new.description, started_at=new.started_at, ended_at=new.ended_at, status=new.status, analysis_status=new.analysis_status, analyzed_at=new.analyzed_at, geom=new.geom, updated_at=clock_timestamp() where id = old.id;
      update railway_central.disruptions set type=new.type, track_id=new.track_id, station_id=new.station_id, severity=new.severity, reported_by=new.reported_by, description=new.description, started_at=new.started_at, ended_at=new.ended_at, status=new.status, analysis_status=new.analysis_status, analyzed_at=new.analyzed_at, geom=new.geom, updated_at=clock_timestamp() where id = old.id;
      update railway_north.disruptions set type=new.type, track_id=new.track_id, station_id=new.station_id, severity=new.severity, reported_by=new.reported_by, description=new.description, started_at=new.started_at, ended_at=new.ended_at, status=new.status, analysis_status=new.analysis_status, analyzed_at=new.analyzed_at, geom=new.geom, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'affected_trains' then
      update railway_south.affected_trains set impact_type=new.impact_type, estimated_delay_minutes=new.estimated_delay_minutes, status=new.status, updated_at=clock_timestamp() where id = old.id;
      update railway_central.affected_trains set impact_type=new.impact_type, estimated_delay_minutes=new.estimated_delay_minutes, status=new.status, updated_at=clock_timestamp() where id = old.id;
      update railway_north.affected_trains set impact_type=new.impact_type, estimated_delay_minutes=new.estimated_delay_minutes, status=new.status, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'route_recommendations' then
      update railway_south.route_recommendations set disruption_id=new.disruption_id, train_journey_id=new.train_journey_id, original_route=new.original_route, recommended_route=new.recommended_route, status=new.status, distance_km=new.distance_km, estimated_travel_minutes=new.estimated_travel_minutes, estimated_delay_minutes=new.estimated_delay_minutes, score=new.score, updated_at=clock_timestamp() where id = old.id;
      update railway_central.route_recommendations set disruption_id=new.disruption_id, train_journey_id=new.train_journey_id, original_route=new.original_route, recommended_route=new.recommended_route, status=new.status, distance_km=new.distance_km, estimated_travel_minutes=new.estimated_travel_minutes, estimated_delay_minutes=new.estimated_delay_minutes, score=new.score, updated_at=clock_timestamp() where id = old.id;
      update railway_north.route_recommendations set disruption_id=new.disruption_id, train_journey_id=new.train_journey_id, original_route=new.original_route, recommended_route=new.recommended_route, status=new.status, distance_km=new.distance_km, estimated_travel_minutes=new.estimated_travel_minutes, estimated_delay_minutes=new.estimated_delay_minutes, score=new.score, updated_at=clock_timestamp() where id = old.id;
      return new;
    elsif tg_table_name = 'event_log' then
      update railway_south.event_log set status=new.status, processed_at=new.processed_at, attempts=new.attempts, available_at=new.available_at, locked_at=new.locked_at, lock_token=new.lock_token, last_error=new.last_error where id = old.id;
      update railway_central.event_log set status=new.status, processed_at=new.processed_at, attempts=new.attempts, available_at=new.available_at, locked_at=new.locked_at, lock_token=new.lock_token, last_error=new.last_error where id = old.id;
      update railway_north.event_log set status=new.status, processed_at=new.processed_at, attempts=new.attempts, available_at=new.available_at, locked_at=new.locked_at, lock_token=new.lock_token, last_error=new.last_error where id = old.id;
      return new;
    elsif tg_table_name = 'import_batches' then
      update railway_south.import_batches set status=new.status, stations_imported=new.stations_imported, tracks_imported=new.tracks_imported, trains_imported=new.trains_imported, completed_at=new.completed_at, error_summary=new.error_summary where id = old.id;
      update railway_central.import_batches set status=new.status, stations_imported=new.stations_imported, tracks_imported=new.tracks_imported, trains_imported=new.trains_imported, completed_at=new.completed_at, error_summary=new.error_summary where id = old.id;
      update railway_north.import_batches set status=new.status, stations_imported=new.stations_imported, tracks_imported=new.tracks_imported, trains_imported=new.trains_imported, completed_at=new.completed_at, error_summary=new.error_summary where id = old.id;
      return new;
    end if;

  elsif tg_op = 'DELETE' then
    if tg_table_name = 'stations' then
      delete from railway_south.stations where id = old.id;
      delete from railway_central.stations where id = old.id;
      delete from railway_north.stations where id = old.id;
      return old;
    elsif tg_table_name = 'tracks' then
      delete from railway_south.tracks where id = old.id;
      delete from railway_central.tracks where id = old.id;
      delete from railway_north.tracks where id = old.id;
      return old;
    elsif tg_table_name = 'trains' then
      delete from railway_south.trains where id = old.id;
      delete from railway_central.trains where id = old.id;
      delete from railway_north.trains where id = old.id;
      return old;
    elsif tg_table_name = 'train_schedules' then
      delete from railway_south.train_schedules where id = old.id;
      delete from railway_central.train_schedules where id = old.id;
      delete from railway_north.train_schedules where id = old.id;
      return old;
    elsif tg_table_name = 'train_journeys' then
      delete from railway_south.train_journeys where id = old.id;
      delete from railway_central.train_journeys where id = old.id;
      delete from railway_north.train_journeys where id = old.id;
      return old;
    elsif tg_table_name = 'disruptions' then
      delete from railway_south.disruptions where id = old.id;
      delete from railway_central.disruptions where id = old.id;
      delete from railway_north.disruptions where id = old.id;
      return old;
    elsif tg_table_name = 'affected_trains' then
      delete from railway_south.affected_trains where id = old.id;
      delete from railway_central.affected_trains where id = old.id;
      delete from railway_north.affected_trains where id = old.id;
      return old;
    elsif tg_table_name = 'route_recommendations' then
      delete from railway_south.route_recommendations where id = old.id;
      delete from railway_central.route_recommendations where id = old.id;
      delete from railway_north.route_recommendations where id = old.id;
      return old;
    elsif tg_table_name = 'event_log' then
      delete from railway_south.event_log where id = old.id;
      delete from railway_central.event_log where id = old.id;
      delete from railway_north.event_log where id = old.id;
      return old;
    end if;
  end if;

  return new;
end $$;

-- Triggers for public views
drop trigger if exists trg_io_public_stations on public.stations;
create trigger trg_io_public_stations instead of insert or update or delete on public.stations
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_tracks on public.tracks;
create trigger trg_io_public_tracks instead of insert or update or delete on public.tracks
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_trains on public.trains;
create trigger trg_io_public_trains instead of insert or update or delete on public.trains
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_train_schedules on public.train_schedules;
create trigger trg_io_public_train_schedules instead of insert or update or delete on public.train_schedules
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_train_journeys on public.train_journeys;
create trigger trg_io_public_train_journeys instead of insert or update or delete on public.train_journeys
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_disruptions on public.disruptions;
create trigger trg_io_public_disruptions instead of insert or update or delete on public.disruptions
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_affected_trains on public.affected_trains;
create trigger trg_io_public_affected_trains instead of insert or update or delete on public.affected_trains
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_route_recommendations on public.route_recommendations;
create trigger trg_io_public_route_recommendations instead of insert or update or delete on public.route_recommendations
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_event_log on public.event_log;
create trigger trg_io_public_event_log instead of insert or update or delete on public.event_log
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_track_status_history on public.track_status_history;
create trigger trg_io_public_track_status_history instead of insert or update or delete on public.track_status_history
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_train_status_history on public.train_status_history;
create trigger trg_io_public_train_status_history instead of insert or update or delete on public.train_status_history
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_journey_status_history on public.journey_status_history;
create trigger trg_io_public_journey_status_history instead of insert or update or delete on public.journey_status_history
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_journey_delay_history on public.journey_delay_history;
create trigger trg_io_public_journey_delay_history instead of insert or update or delete on public.journey_delay_history
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_disruption_history on public.disruption_history;
create trigger trg_io_public_disruption_history instead of insert or update or delete on public.disruption_history
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_import_batches on public.import_batches;
create trigger trg_io_public_import_batches instead of insert or update or delete on public.import_batches
  for each row execute function public.trg_instead_of_public_write();

drop trigger if exists trg_io_public_import_rejections on public.import_rejections;
create trigger trg_io_public_import_rejections instead of insert or update or delete on public.import_rejections
  for each row execute function public.trg_instead_of_public_write();

-- 6. Helper Views in public
create or replace view public.v_distributed_stations as
select 'railway_south'::text storage_region, s.* from railway_south.stations s
union all select 'railway_central', s.* from railway_central.stations s
union all select 'railway_north', s.* from railway_north.stations s;

create or replace view public.v_distributed_tracks as
select 'railway_south'::text storage_region, t.* from railway_south.tracks t
union all select 'railway_central', t.* from railway_central.tracks t
union all select 'railway_north', t.* from railway_north.tracks t;

create or replace view public.v_train_schedule_ordered as
select
  ts.id schedule_id,
  ts.train_id,
  t.train_number,
  t.name train_name,
  ts.stop_sequence,
  ts.station_id,
  s.station_code,
  s.name station_name,
  ts.scheduled_arrival,
  ts.scheduled_departure,
  ts.day_offset,
  ts.platform
from public.train_schedules ts
join public.trains t on t.id = ts.train_id
join public.stations s on s.id = ts.station_id;

create or replace view public.v_track_network as
select
  tr.id track_id,
  fs.station_code from_station_code,
  fs.name from_station_name,
  ts.station_code to_station_code,
  ts.name to_station_name,
  tr.distance_km,
  tr.speed_limit_kmph,
  tr.status track_status,
  tr.region_id,
  r.code region_code,
  r.name region_name
from public.tracks tr
join public.stations fs on fs.id = tr.from_station_id
join public.stations ts on ts.id = tr.to_station_id
join public.regions r on r.id = tr.region_id;

-- 7. Functions in public schema
create or replace function public.fn_get_train_schedule(p_train_id uuid)
returns table (
  train_id uuid,
  train_number text,
  train_name text,
  stop_sequence integer,
  station_id uuid,
  station_code text,
  station_name text,
  scheduled_arrival time,
  scheduled_departure time,
  day_offset integer,
  platform text
)
language sql stable as $$
  select
    v.train_id, v.train_number, v.train_name, v.stop_sequence,
    v.station_id, v.station_code, v.station_name,
    v.scheduled_arrival, v.scheduled_departure, v.day_offset, v.platform
  from public.v_train_schedule_ordered v
  where v.train_id = p_train_id
  order by v.stop_sequence;
$$;

create or replace function public.fn_get_train_schedule(p_train_number text)
returns table (
  train_id uuid, train_number text, train_name text, stop_sequence integer,
  station_id uuid, station_code text, station_name text,
  scheduled_arrival time, scheduled_departure time, day_offset integer, platform text
)
language sql stable as $$
  select * from public.fn_get_train_schedule((
    select t.id from public.trains t where t.train_number = p_train_number limit 1
  ));
$$;

create or replace function public.fn_get_active_track_availability(p_track_id uuid, p_at_time timestamptz default now())
returns table (track_id uuid, status public.track_status, is_available boolean, valid_from timestamptz, valid_to timestamptz)
language sql stable as $$
  select tr.id, tr.status,
    (tr.status = 'ACTIVE'::public.track_status and tr.valid_from <= p_at_time and (tr.valid_to is null or tr.valid_to > p_at_time)) as is_available,
    tr.valid_from, tr.valid_to
  from public.tracks tr where tr.id = p_track_id;
$$;

create or replace function public.fn_find_nearby_stations(p_point extensions.geography, p_radius_km numeric default 50)
returns table (station_id uuid, station_code text, station_name text, distance_km numeric)
language sql stable as $$
  select s.id, s.station_code, s.name,
    round((extensions.ST_Distance(s.geom, p_point) / 1000.0)::numeric, 2) as distance_km
  from public.stations s
  where extensions.ST_DWithin(s.geom, p_point, p_radius_km * 1000)
  order by s.geom <-> p_point;
$$;

create or replace function public.fn_network_geojson() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.ST_AsGeoJSON(t.geom)::jsonb,
        'properties', jsonb_build_object(
          'id', t.id,
          'from_station_id', t.from_station_id,
          'to_station_id', t.to_station_id,
          'distance_km', t.distance_km,
          'speed_limit_kmph', t.speed_limit_kmph,
          'status', t.status,
          'region_id', t.region_id
        )
      )
    ), '[]'::jsonb)
  ) from public.tracks t;
$$;

-- 8. Drop central railway_main schema completely
drop schema if exists railway_main cascade;

-- 9. Permissions setup
grant usage on schema public, railway_south, railway_central, railway_north to railway_app;
grant all on all tables in schema public, railway_south, railway_central, railway_north to railway_app;
grant all on all routines in schema public, railway_south, railway_central, railway_north to railway_app;
grant all on all sequences in schema public, railway_south, railway_central, railway_north to railway_app;
revoke insert,update,delete on public.schema_migrations, public.logic_artifacts from railway_app;
