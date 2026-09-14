-- Phase 6 functions: SQL-first analysis helpers.

create or replace function railway_main.fn_get_train_schedule(p_train_id uuid)
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
language sql
stable
as $$
  select
    v.train_id,
    v.train_number,
    v.train_name,
    v.stop_sequence,
    v.station_id,
    v.station_code,
    v.station_name,
    v.scheduled_arrival,
    v.scheduled_departure,
    v.day_offset,
    v.platform
  from railway_main.v_train_schedule_ordered v
  where v.train_id = p_train_id
  order by v.stop_sequence;
$$;

create or replace function railway_main.fn_get_train_schedule(p_train_number text)
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
language sql
stable
as $$
  select *
  from railway_main.fn_get_train_schedule((
    select t.id
    from railway_main.trains t
    where t.train_number = p_train_number
  ));
$$;

create or replace function railway_main.fn_get_active_track_availability(
  p_track_id uuid,
  p_at_time timestamptz default now()
)
returns table (
  track_id uuid,
  status railway_main.track_status,
  is_available boolean,
  valid_from timestamptz,
  valid_to timestamptz
)
language sql
stable
as $$
  select
    tr.id,
    tr.status,
    (
      tr.status = 'ACTIVE'::railway_main.track_status
      and tr.valid_from <= p_at_time
      and (tr.valid_to is null or tr.valid_to > p_at_time)
    ) as is_available,
    tr.valid_from,
    tr.valid_to
  from railway_main.tracks tr
  where tr.id = p_track_id;
$$;

create or replace function railway_main.fn_find_nearby_stations(
  p_point extensions.geography,
  p_radius_km numeric default 50
)
returns table (
  station_id uuid,
  station_code text,
  station_name text,
  distance_km numeric
)
language sql
stable
as $$
  select
    s.id,
    s.station_code,
    s.name,
    round((ST_Distance(s.geom, p_point) / 1000)::numeric, 2) as distance_km
  from railway_main.stations s
  where s.status = 'ACTIVE'::railway_main.station_status
    and ST_DWithin(s.geom, p_point, p_radius_km * 1000)
  order by ST_Distance(s.geom, p_point), s.station_code;
$$;

create or replace function railway_main.fn_estimate_delay_minutes(
  p_extra_distance_km numeric,
  p_speed_limit_kmph integer,
  p_severity railway_main.disruption_severity
)
returns integer
language sql
immutable
as $$
  select greatest(
    0,
    ceil(
      (coalesce(p_extra_distance_km, 0) / nullif(p_speed_limit_kmph, 0)) * 60 *
      case p_severity
        when 'LOW'::railway_main.disruption_severity then 1.10
        when 'MEDIUM'::railway_main.disruption_severity then 1.25
        when 'HIGH'::railway_main.disruption_severity then 1.50
        when 'CRITICAL'::railway_main.disruption_severity then 2.00
        else 1.00
      end
    )::integer
  );
$$;

create or replace function railway_main.fn_get_disruption_context(p_disruption_id uuid)
returns table (
  disruption_id uuid,
  type railway_main.disruption_type,
  severity railway_main.disruption_severity,
  status railway_main.disruption_status,
  track_id uuid,
  station_id uuid,
  from_station_code text,
  to_station_code text,
  station_code text,
  started_at timestamptz,
  geom extensions.geography
)
language sql
stable
as $$
  select
    d.id,
    d.type,
    d.severity,
    d.status,
    d.track_id,
    d.station_id,
    fs.station_code,
    ts.station_code,
    s.station_code,
    d.started_at,
    d.geom
  from railway_main.disruptions d
  left join railway_main.tracks tr on tr.id = d.track_id
  left join railway_main.stations fs on fs.id = tr.from_station_id
  left join railway_main.stations ts on ts.id = tr.to_station_id
  left join railway_main.stations s on s.id = d.station_id
  where d.id = p_disruption_id;
$$;

create or replace function railway_main.fn_find_trains_using_track(
  p_track_id uuid,
  p_journey_date date default current_date
)
returns table (
  train_journey_id uuid,
  train_id uuid,
  train_number text,
  train_name text,
  journey_status railway_main.journey_status,
  delay_minutes integer,
  current_station_code text,
  next_station_code text
)
language sql
stable
as $$
  with target_track as (
    select from_station_id, to_station_id
    from railway_main.tracks
    where id = p_track_id
  ),
  schedule_edges as (
    select
      t.id as train_id,
      t.train_number,
      t.name as train_name,
      from_stop.station_id as from_station_id,
      to_stop.station_id as to_station_id
    from railway_main.trains t
    join railway_main.train_schedules from_stop on from_stop.train_id = t.id
    join railway_main.train_schedules to_stop
      on to_stop.train_id = t.id
     and to_stop.stop_sequence = from_stop.stop_sequence + 1
  )
  select distinct
    tj.id,
    t.id,
    t.train_number,
    t.name,
    tj.journey_status,
    tj.delay_minutes,
    cs.station_code,
    ns.station_code
  from target_track tt
  join schedule_edges se
    on se.from_station_id = tt.from_station_id
   and se.to_station_id = tt.to_station_id
  join railway_main.trains t on t.id = se.train_id
  join railway_main.train_journeys tj
    on tj.train_id = t.id
   and tj.journey_date = p_journey_date
  left join railway_main.stations cs on cs.id = tj.current_station_id
  left join railway_main.stations ns on ns.id = tj.next_station_id
  where tj.journey_status in ('RUNNING', 'DELAYED', 'REROUTED', 'SCHEDULED');
$$;
