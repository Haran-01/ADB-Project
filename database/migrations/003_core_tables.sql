-- Phase 3 migration: core tables, keys, constraints, history tables, and spatial columns.

create table if not exists railway_main.regions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regions_code_upper_chk check (code = upper(code)),
  constraint regions_code_not_blank_chk check (length(trim(code)) > 0),
  constraint regions_name_not_blank_chk check (length(trim(name)) > 0)
);

create table if not exists railway_main.stations (
  id uuid primary key default extensions.gen_random_uuid(),
  station_code text not null unique,
  name text not null,
  region_id uuid not null references railway_main.regions(id) on update cascade on delete restrict,
  zone text,
  state text,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  geom extensions.geography(Point, 4326) not null,
  status railway_main.station_status not null default 'ACTIVE'::railway_main.station_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stations_code_upper_chk check (station_code = upper(station_code)),
  constraint stations_code_not_blank_chk check (length(trim(station_code)) > 0),
  constraint stations_name_not_blank_chk check (length(trim(name)) > 0),
  constraint stations_latitude_chk check (latitude between -90 and 90),
  constraint stations_longitude_chk check (longitude between -180 and 180)
);

create table if not exists railway_main.tracks (
  id uuid primary key default extensions.gen_random_uuid(),
  from_station_id uuid not null references railway_main.stations(id) on update cascade on delete restrict,
  to_station_id uuid not null references railway_main.stations(id) on update cascade on delete restrict,
  region_id uuid not null references railway_main.regions(id) on update cascade on delete restrict,
  distance_km numeric(8,2) not null,
  track_type text not null,
  speed_limit_kmph integer not null,
  status railway_main.track_status not null default 'ACTIVE'::railway_main.track_status,
  geom extensions.geography(LineString, 4326) not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracks_distinct_stations_chk check (from_station_id <> to_station_id),
  constraint tracks_distance_positive_chk check (distance_km > 0),
  constraint tracks_speed_positive_chk check (speed_limit_kmph > 0),
  constraint tracks_type_not_blank_chk check (length(trim(track_type)) > 0),
  constraint tracks_valid_window_chk check (valid_to is null or valid_to > valid_from),
  constraint tracks_direction_unique unique (from_station_id, to_station_id)
);

create table if not exists railway_main.trains (
  id uuid primary key default extensions.gen_random_uuid(),
  train_number text not null unique,
  name text not null,
  train_type railway_main.train_type not null,
  priority integer not null,
  source_station_id uuid not null references railway_main.stations(id) on update cascade on delete restrict,
  destination_station_id uuid not null references railway_main.stations(id) on update cascade on delete restrict,
  status railway_main.train_status not null default 'SCHEDULED'::railway_main.train_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trains_number_not_blank_chk check (length(trim(train_number)) > 0),
  constraint trains_name_not_blank_chk check (length(trim(name)) > 0),
  constraint trains_priority_positive_chk check (priority > 0),
  constraint trains_distinct_endpoints_chk check (source_station_id <> destination_station_id)
);

create table if not exists railway_main.train_schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  train_id uuid not null references railway_main.trains(id) on update cascade on delete cascade,
  station_id uuid not null references railway_main.stations(id) on update cascade on delete restrict,
  stop_sequence integer not null,
  scheduled_arrival time,
  scheduled_departure time,
  day_offset integer not null default 0,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint train_schedules_stop_positive_chk check (stop_sequence > 0),
  constraint train_schedules_day_offset_chk check (day_offset >= 0),
  constraint train_schedules_train_stop_unique unique (train_id, stop_sequence),
  constraint train_schedules_train_station_stop_unique unique (train_id, station_id, stop_sequence)
);

create table if not exists railway_main.train_journeys (
  id uuid primary key default extensions.gen_random_uuid(),
  train_id uuid not null references railway_main.trains(id) on update cascade on delete restrict,
  journey_date date not null,
  current_station_id uuid references railway_main.stations(id) on update cascade on delete restrict,
  next_station_id uuid references railway_main.stations(id) on update cascade on delete restrict,
  actual_arrival timestamptz,
  actual_departure timestamptz,
  delay_minutes integer not null default 0,
  journey_status railway_main.journey_status not null default 'SCHEDULED'::railway_main.journey_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint train_journeys_train_date_unique unique (train_id, journey_date),
  constraint train_journeys_delay_nonnegative_chk check (delay_minutes >= 0),
  constraint train_journeys_distinct_current_next_chk check (
    current_station_id is null
    or next_station_id is null
    or current_station_id <> next_station_id
  )
);

create table if not exists railway_main.disruptions (
  id uuid primary key default extensions.gen_random_uuid(),
  type railway_main.disruption_type not null,
  track_id uuid references railway_main.tracks(id) on update cascade on delete restrict,
  station_id uuid references railway_main.stations(id) on update cascade on delete restrict,
  severity railway_main.disruption_severity not null,
  reported_by text,
  description text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status railway_main.disruption_status not null default 'OPEN'::railway_main.disruption_status,
  geom extensions.geography(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disruptions_target_present_chk check (track_id is not null or station_id is not null),
  constraint disruptions_time_window_chk check (ended_at is null or ended_at > started_at)
);

create table if not exists railway_main.affected_trains (
  id uuid primary key default extensions.gen_random_uuid(),
  disruption_id uuid not null references railway_main.disruptions(id) on update cascade on delete cascade,
  train_journey_id uuid not null references railway_main.train_journeys(id) on update cascade on delete cascade,
  impact_type railway_main.impact_type not null,
  estimated_delay_minutes integer not null default 0,
  status railway_main.affected_train_status not null default 'PENDING'::railway_main.affected_train_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affected_trains_delay_nonnegative_chk check (estimated_delay_minutes >= 0),
  constraint affected_trains_disruption_journey_unique unique (disruption_id, train_journey_id)
);

create table if not exists railway_main.route_recommendations (
  id uuid primary key default extensions.gen_random_uuid(),
  disruption_id uuid not null references railway_main.disruptions(id) on update cascade on delete cascade,
  train_journey_id uuid not null references railway_main.train_journeys(id) on update cascade on delete cascade,
  original_route jsonb not null,
  recommended_route jsonb not null,
  distance_km numeric(8,2) not null,
  estimated_travel_minutes integer not null,
  estimated_delay_minutes integer not null,
  score numeric(10,4) not null,
  status railway_main.recommendation_status not null default 'PROPOSED'::railway_main.recommendation_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_recommendations_distance_positive_chk check (distance_km > 0),
  constraint route_recommendations_travel_positive_chk check (estimated_travel_minutes > 0),
  constraint route_recommendations_delay_nonnegative_chk check (estimated_delay_minutes >= 0),
  constraint route_recommendations_score_nonnegative_chk check (score >= 0)
);

create table if not exists railway_main.event_log (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type railway_main.event_type not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  status railway_main.event_status not null default 'PENDING'::railway_main.event_status,
  constraint event_log_entity_type_not_blank_chk check (length(trim(entity_type)) > 0),
  constraint event_log_processed_window_chk check (processed_at is null or processed_at >= created_at)
);

create table if not exists railway_main.track_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  track_id uuid not null references railway_main.tracks(id) on update cascade on delete cascade,
  old_status railway_main.track_status,
  new_status railway_main.track_status not null,
  changed_at timestamptz not null default now(),
  changed_by text,
  reason text
);

create table if not exists railway_main.train_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  train_id uuid not null references railway_main.trains(id) on update cascade on delete cascade,
  old_status railway_main.train_status,
  new_status railway_main.train_status not null,
  changed_at timestamptz not null default now(),
  changed_by text,
  reason text
);

create table if not exists railway_main.journey_delay_history (
  id uuid primary key default extensions.gen_random_uuid(),
  train_journey_id uuid not null references railway_main.train_journeys(id) on update cascade on delete cascade,
  old_delay_minutes integer,
  new_delay_minutes integer not null,
  changed_at timestamptz not null default now(),
  changed_by text,
  reason text,
  constraint journey_delay_history_old_delay_chk check (old_delay_minutes is null or old_delay_minutes >= 0),
  constraint journey_delay_history_new_delay_chk check (new_delay_minutes >= 0)
);

create table if not exists railway_main.disruption_history (
  id uuid primary key default extensions.gen_random_uuid(),
  disruption_id uuid not null references railway_main.disruptions(id) on update cascade on delete cascade,
  old_status railway_main.disruption_status,
  new_status railway_main.disruption_status not null,
  changed_at timestamptz not null default now(),
  changed_by text,
  note text
);

