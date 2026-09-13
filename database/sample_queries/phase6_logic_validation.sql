-- Phase 6 SQL business logic validation.
-- Blocks are executed by scripts/run-validation.mjs.

-- @check phase6_expected_views_present
with required(view_name) as (
  values
    ('v_active_disruptions'),
    ('v_active_train_journeys'),
    ('v_track_network'),
    ('v_train_schedule_ordered'),
    ('v_disruption_impact_summary')
),
missing as (
  select r.view_name
  from required r
  left join information_schema.views v
    on v.table_schema = 'railway_main'
   and v.table_name = r.view_name
  where v.table_name is null
)
select
  'phase6_expected_views_present' as check_name,
  coalesce(jsonb_agg(view_name order by view_name), '[]'::jsonb) as actual,
  'missing view list should be empty' as expected,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from missing;
-- @end

-- @check phase6_active_views_return_rows
select
  'phase6_active_views_return_rows' as check_name,
  jsonb_build_object(
    'active_train_journeys', (select count(*) from railway_main.v_active_train_journeys),
    'active_disruptions', (select count(*) from railway_main.v_active_disruptions),
    'track_network_rows', (select count(*) from railway_main.v_track_network),
    'schedule_rows', (select count(*) from railway_main.v_train_schedule_ordered),
    'impact_summary_rows', (select count(*) from railway_main.v_disruption_impact_summary)
  ) as actual,
  'views should expose seeded operational data' as expected,
  case when
    (select count(*) from railway_main.v_active_train_journeys) = 12
    and (select count(*) from railway_main.v_active_disruptions) = 2
    and (select count(*) from railway_main.v_track_network) = 60
    and (select count(*) from railway_main.v_train_schedule_ordered) = 80
    and (select count(*) from railway_main.v_disruption_impact_summary) = 3
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @check phase6_get_train_schedule_function
select
  'phase6_get_train_schedule_function' as check_name,
  jsonb_build_object(
    'train_number', '12635',
    'stop_count', count(*),
    'first_stop', min(station_code) filter (where stop_sequence = 1),
    'last_stop', max(station_code) filter (where stop_sequence = 7)
  ) as actual,
  'fn_get_train_schedule(text) should return 7 stops for train 12635' as expected,
  case when
    count(*) = 7
    and min(station_code) filter (where stop_sequence = 1) = 'MS'
    and max(station_code) filter (where stop_sequence = 7) = 'MDU'
  then 'PASS' else 'FAIL' end as status
from railway_main.fn_get_train_schedule('12635');
-- @end

-- @check phase6_track_availability_function
with target as (
  select tr.id
  from railway_main.tracks tr
  join railway_main.stations fs on fs.id = tr.from_station_id
  join railway_main.stations ts on ts.id = tr.to_station_id
  where fs.station_code = 'CGL'
    and ts.station_code = 'VM'
)
select
  'phase6_track_availability_function' as check_name,
  jsonb_build_object('is_available', bool_or(a.is_available), 'status', max(a.status::text)) as actual,
  'CGL -> VM demo track should currently be available before Phase 7 trigger simulation' as expected,
  case when bool_or(a.is_available) then 'PASS' else 'FAIL' end as status
from target t
cross join lateral railway_main.fn_get_active_track_availability(t.id, now()) a;
-- @end

-- @check phase6_nearby_stations_function
with target as (
  select geom
  from railway_main.disruptions
  where type = 'TRACK_FAILURE'
  limit 1
)
select
  'phase6_nearby_stations_function' as check_name,
  jsonb_build_object('nearby_count_80km', count(*)) as actual,
  'fn_find_nearby_stations should find at least 2 nearby stations' as expected,
  case when count(*) >= 2 then 'PASS' else 'FAIL' end as status
from target t
cross join lateral railway_main.fn_find_nearby_stations(t.geom, 80);
-- @end

-- @check phase6_delay_estimation_function
select
  'phase6_delay_estimation_function' as check_name,
  jsonb_build_object(
    'low_delay', railway_main.fn_estimate_delay_minutes(100, 100, 'LOW'),
    'high_delay', railway_main.fn_estimate_delay_minutes(100, 100, 'HIGH')
  ) as actual,
  'higher severity should produce greater delay estimate' as expected,
  case when railway_main.fn_estimate_delay_minutes(100, 100, 'HIGH') > railway_main.fn_estimate_delay_minutes(100, 100, 'LOW')
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @check phase6_disruption_context_function
with target as (
  select id
  from railway_main.disruptions
  where type = 'TRACK_FAILURE'
  limit 1
)
select
  'phase6_disruption_context_function' as check_name,
  jsonb_build_object(
    'rows', count(*),
    'from_station_code', max(from_station_code),
    'to_station_code', max(to_station_code)
  ) as actual,
  'track failure context should resolve CGL -> VM' as expected,
  case when count(*) = 1 and max(from_station_code) = 'CGL' and max(to_station_code) = 'VM'
  then 'PASS' else 'FAIL' end as status
from target t
cross join lateral railway_main.fn_get_disruption_context(t.id);
-- @end

-- @check phase6_find_trains_using_track_function
with target as (
  select tr.id
  from railway_main.tracks tr
  join railway_main.stations fs on fs.id = tr.from_station_id
  join railway_main.stations ts on ts.id = tr.to_station_id
  where fs.station_code = 'CGL'
    and ts.station_code = 'VM'
)
select
  'phase6_find_trains_using_track_function' as check_name,
  jsonb_build_object('train_numbers', coalesce(jsonb_agg(train_number order by train_number), '[]'::jsonb)) as actual,
  'function should find trains 12635 and 16127 using CGL -> VM' as expected,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as status
from target t
cross join lateral railway_main.fn_find_trains_using_track(t.id, current_date);
-- @end

-- @check phase6_procedure_record_affected_train
do $$
declare
  v_disruption_id uuid;
  v_train_journey_id uuid;
begin
  select d.id, tj.id
  into v_disruption_id, v_train_journey_id
  from railway_main.disruptions d
  cross join railway_main.train_journeys tj
  join railway_main.trains t on t.id = tj.train_id
  where d.type = 'TRACK_FAILURE'
    and t.train_number = '12635'
  limit 1;

  call railway_main.sp_record_affected_train(
    v_disruption_id,
    v_train_journey_id,
    'DIRECT_TRACK_BLOCK'::railway_main.impact_type,
    45,
    'PENDING'::railway_main.affected_train_status
  );
end $$;

with target as (
  select
    d.id as disruption_id,
    tj.id as train_journey_id
  from railway_main.disruptions d
  cross join railway_main.train_journeys tj
  join railway_main.trains t on t.id = tj.train_id
  where d.type = 'TRACK_FAILURE'
    and t.train_number = '12635'
  limit 1
)
select
  'phase6_procedure_record_affected_train' as check_name,
  jsonb_build_object('affected_rows_for_12635', count(*), 'delay', max(at.estimated_delay_minutes)) as actual,
  'procedure should upsert existing affected train row without duplicating it' as expected,
  case when count(*) = 1 and max(at.estimated_delay_minutes) = 45 then 'PASS' else 'FAIL' end as status
from target
join railway_main.affected_trains at
  on at.disruption_id = target.disruption_id
 and at.train_journey_id = target.train_journey_id;
-- @end
