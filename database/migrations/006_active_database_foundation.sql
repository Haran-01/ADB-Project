create table railway_main.logic_artifacts (
  filename text primary key, checksum text not null, applied_at timestamptz not null default now()
);
alter table railway_main.disruptions
  add column analysis_status text not null default 'PENDING'
    check (analysis_status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  add column analyzed_at timestamptz;
alter table railway_main.train_journeys add column active_route jsonb;
alter table railway_main.route_recommendations
  add constraint recommendation_affected_pair_fk foreign key (disruption_id,train_journey_id)
    references railway_main.affected_trains(disruption_id,train_journey_id) on delete cascade,
  add constraint recommendation_route_arrays_chk check (
    jsonb_typeof(original_route)='array' and jsonb_typeof(recommended_route)='array'
    and jsonb_array_length(recommended_route)>=2);
create unique index idx_one_applied_route_per_journey
  on railway_main.route_recommendations(train_journey_id) where status='APPLIED';
alter table railway_main.disruptions add constraint disruptions_one_target_chk
  check (num_nonnulls(track_id,station_id)=1);
create unique index idx_one_unresolved_disruption_per_track on railway_main.disruptions(track_id)
  where track_id is not null and status in ('OPEN','ANALYZING');
create unique index idx_one_unresolved_disruption_per_station on railway_main.disruptions(station_id)
  where station_id is not null and status in ('OPEN','ANALYZING');
alter table railway_main.stations add constraint stations_point_matches_coordinates_chk check (
  abs(extensions.ST_X(geom::extensions.geometry)-longitude)<0.000001
  and abs(extensions.ST_Y(geom::extensions.geometry)-latitude)<0.000001);
alter table railway_main.tracks add column geometry_distance_km double precision
  generated always as (extensions.ST_Length(geom)/1000) stored;
create table railway_main.journey_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  train_journey_id uuid not null references railway_main.train_journeys(id) on delete cascade,
  old_status railway_main.journey_status, new_status railway_main.journey_status not null,
  changed_at timestamptz not null default now(), changed_by text, reason text
);
create index idx_journey_status_history_journey_changed
  on railway_main.journey_status_history(train_journey_id,changed_at);
alter table railway_main.event_log
  add column event_sequence bigserial unique,
  add column attempts integer not null default 0 check (attempts>=0),
  add column available_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add column lock_token uuid,
  add column last_error text;
create index idx_event_log_ready on railway_main.event_log(available_at,created_at)
  where status in ('PENDING','PROCESSING');

-- Server-only data: no anonymous/client access, including newly created objects.
revoke all on schema railway_main from public;
revoke all on all tables in schema railway_main from public;
revoke all on all sequences in schema railway_main from public;
revoke execute on all routines in schema railway_main from public;
alter default privileges in schema railway_main revoke execute on functions from public;
do $$ declare role_name text; t record; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on schema railway_main from %I',role_name);
      execute format('revoke all on all tables in schema railway_main from %I',role_name);
      execute format('revoke all on all sequences in schema railway_main from %I',role_name);
      execute format('revoke all on all routines in schema railway_main from %I',role_name);
    end if;
  end loop;
  for t in select tablename from pg_tables where schemaname='railway_main' loop
    execute format('alter table railway_main.%I enable row level security',t.tablename);
  end loop;
end $$;
