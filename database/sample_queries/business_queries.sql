-- Phase 5 business validation queries.
-- Blocks are executed by scripts/run-validation.mjs.

-- @check active_train_journeys
select
  'active_train_journeys' as check_name,
  jsonb_build_object(
    'active_journeys', count(*),
    'delayed_journeys', count(*) filter (where tj.delay_minutes > 0)
  ) as actual,
  'should return 12 active journey records, including delayed trains' as expected,
  case when count(*) = 12 and count(*) filter (where tj.delay_minutes > 0) = 5
  then 'PASS' else 'FAIL' end as status
from railway_main.train_journeys tj
join railway_main.trains t on t.id = tj.train_id
left join railway_main.stations cs on cs.id = tj.current_station_id
left join railway_main.stations ns on ns.id = tj.next_station_id
where tj.journey_status in ('RUNNING', 'DELAYED', 'REROUTED');
-- @end

-- @check train_schedule_lookup
select
  'train_schedule_lookup' as check_name,
  jsonb_build_object(
    'train_number', '12635',
    'stop_count', count(*),
    'first_stop', min(s.station_code) filter (where sch.stop_sequence = 1),
    'last_stop', min(s.station_code) filter (where sch.stop_sequence = 7)
  ) as actual,
  'Vaigai Express demo should have 7 ordered stops from MS to MDU' as expected,
  case when
    count(*) = 7
    and min(s.station_code) filter (where sch.stop_sequence = 1) = 'MS'
    and min(s.station_code) filter (where sch.stop_sequence = 7) = 'MDU'
  then 'PASS' else 'FAIL' end as status
from railway_main.train_schedules sch
join railway_main.trains t on t.id = sch.train_id
join railway_main.stations s on s.id = sch.station_id
where t.train_number = '12635';
-- @end

-- @check track_availability_lookup
select
  'track_availability_lookup' as check_name,
  jsonb_build_object(
    'active_tracks', count(*) filter (where tr.status = 'ACTIVE'),
    'maintenance_tracks', count(*) filter (where tr.status = 'MAINTENANCE'),
    'failed_tracks', count(*) filter (where tr.status = 'FAILED')
  ) as actual,
  'seed should have mostly active tracks and 2 maintenance directions' as expected,
  case when
    count(*) filter (where tr.status = 'ACTIVE') = 58
    and count(*) filter (where tr.status = 'MAINTENANCE') = 2
    and count(*) filter (where tr.status = 'FAILED') = 0
  then 'PASS' else 'FAIL' end as status
from railway_main.tracks tr;
-- @end

-- @check trains_using_disrupted_track
with disrupted_track as (
  select tr.from_station_id, tr.to_station_id
  from railway_main.disruptions d
  join railway_main.tracks tr on tr.id = d.track_id
  join railway_main.stations fs on fs.id = tr.from_station_id
  join railway_main.stations ts on ts.id = tr.to_station_id
  where d.type = 'TRACK_FAILURE'
    and fs.station_code = 'CGL'
    and ts.station_code = 'VM'
),
schedule_edges as (
  select
    t.train_number,
    from_stop.station_id as from_station_id,
    to_stop.station_id as to_station_id
  from railway_main.trains t
  join railway_main.train_schedules from_stop on from_stop.train_id = t.id
  join railway_main.train_schedules to_stop
    on to_stop.train_id = t.id
   and to_stop.stop_sequence = from_stop.stop_sequence + 1
),
affected as (
  select distinct se.train_number
  from schedule_edges se
  join disrupted_track dt
    on dt.from_station_id = se.from_station_id
   and dt.to_station_id = se.to_station_id
)
select
  'trains_using_disrupted_track' as check_name,
  jsonb_build_object('train_numbers', coalesce(jsonb_agg(train_number order by train_number), '[]'::jsonb)) as actual,
  'should find 2 scheduled trains using CGL -> VM directly' as expected,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as status
from affected;
-- @end

-- @check nearest_stations_to_track_failure
with target as (
  select d.geom
  from railway_main.disruptions d
  where d.type = 'TRACK_FAILURE'
  limit 1
),
nearest as (
  select
    s.station_code,
    round((ST_Distance(s.geom, t.geom) / 1000)::numeric, 2) as distance_km
  from railway_main.stations s
  cross join target t
  order by s.geom <-> t.geom
  limit 5
)
select
  'nearest_stations_to_track_failure' as check_name,
  jsonb_agg(jsonb_build_object('station_code', station_code, 'distance_km', distance_km) order by distance_km) as actual,
  'nearest stations should include CGL or VM near the track failure point' as expected,
  case when bool_or(station_code in ('CGL', 'VM')) then 'PASS' else 'FAIL' end as status
from nearest;
-- @end

-- @check unresolved_disruptions
select
  'unresolved_disruptions' as check_name,
  jsonb_build_object(
    'open_or_analyzing', count(*),
    'types', coalesce(jsonb_agg(type order by type), '[]'::jsonb)
  ) as actual,
  'should have 2 unresolved disruptions: MAINTENANCE and TRACK_FAILURE' as expected,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as status
from railway_main.disruptions
where status in ('OPEN', 'ANALYZING');
-- @end

-- @check route_recommendation_history
select
  'route_recommendation_history' as check_name,
  jsonb_build_object(
    'recommendations', count(*),
    'min_score', min(score),
    'max_delay', max(estimated_delay_minutes)
  ) as actual,
  'should have 2 proposed route recommendations for the track failure' as expected,
  case when count(*) = 2 and min(score) > 0 and max(estimated_delay_minutes) >= 95
  then 'PASS' else 'FAIL' end as status
from railway_main.route_recommendations rr
join railway_main.disruptions d on d.id = rr.disruption_id
where d.type = 'TRACK_FAILURE';
-- @end

-- @check disruption_impact_summary_join
select
  'disruption_impact_summary_join' as check_name,
  jsonb_build_object(
    'track_failure_affected_trains', count(at.id),
    'total_estimated_delay', coalesce(sum(at.estimated_delay_minutes), 0)
  ) as actual,
  'track failure should have 4 affected train rows and 145 total estimated delay minutes' as expected,
  case when count(at.id) = 4 and coalesce(sum(at.estimated_delay_minutes), 0) = 145
  then 'PASS' else 'FAIL' end as status
from railway_main.disruptions d
join railway_main.affected_trains at on at.disruption_id = d.id
where d.type = 'TRACK_FAILURE';
-- @end

-- @check event_log_pending_work
select
  'event_log_pending_work' as check_name,
  jsonb_build_object(
    'pending_events', count(*) filter (where status = 'PENDING'),
    'processed_events', count(*) filter (where status = 'PROCESSED')
  ) as actual,
  'unresolved disruptions should leave pending event work for later workers' as expected,
  case when count(*) filter (where status = 'PENDING') >= 2
    and count(*) filter (where status = 'PROCESSED') = 1
  then 'PASS' else 'FAIL' end as status
from railway_main.event_log;
-- @end

-- @check schedule_to_track_join_coverage
with schedule_edges as (
  select
    t.train_number,
    from_stop.station_id as from_station_id,
    to_stop.station_id as to_station_id
  from railway_main.trains t
  join railway_main.train_schedules from_stop on from_stop.train_id = t.id
  join railway_main.train_schedules to_stop
    on to_stop.train_id = t.id
   and to_stop.stop_sequence = from_stop.stop_sequence + 1
),
coverage as (
  select
    count(*) as schedule_edges,
    count(tr.id) as matched_tracks
  from schedule_edges se
  left join railway_main.tracks tr
    on tr.from_station_id = se.from_station_id
   and tr.to_station_id = se.to_station_id
)
select
  'schedule_to_track_join_coverage' as check_name,
  jsonb_build_object('schedule_edges', schedule_edges, 'matched_tracks', matched_tracks) as actual,
  'every consecutive scheduled stop pair should map to a track row' as expected,
  case when schedule_edges = matched_tracks then 'PASS' else 'FAIL' end as status
from coverage;
-- @end
