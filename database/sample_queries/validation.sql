-- Phase 5 validation checks.
-- Blocks are executed by scripts/run-validation.mjs.

-- @scope fixture
-- @check table_counts
select
  'table_counts' as check_name,
  jsonb_build_object(
    'regions', (select count(*) from railway_main.regions),
    'stations', (select count(*) from railway_main.stations),
    'tracks', (select count(*) from railway_main.tracks),
    'trains', (select count(*) from railway_main.trains),
    'train_schedules', (select count(*) from railway_main.train_schedules),
    'train_journeys', (select count(*) from railway_main.train_journeys),
    'disruptions', (select count(*) from railway_main.disruptions),
    'affected_trains', (select count(*) from railway_main.affected_trains),
    'route_recommendations', (select count(*) from railway_main.route_recommendations),
    'event_log', (select count(*) from railway_main.event_log)
  ) as actual,
  jsonb_build_object(
    'regions', 1,
    'stations', 25,
    'tracks', 60,
    'trains', 12,
    'train_schedules', 80,
    'train_journeys', 12,
    'disruptions', 3,
    'affected_trains', 4,
    'route_recommendations', 2,
    'event_log', 3
  ) as expected,
  case when
    (select count(*) from railway_main.regions) = 1
    and (select count(*) from railway_main.stations) = 25
    and (select count(*) from railway_main.tracks) = 60
    and (select count(*) from railway_main.trains) = 12
    and (select count(*) from railway_main.train_schedules) = 80
    and (select count(*) from railway_main.train_journeys) = 12
    and (select count(*) from railway_main.disruptions) = 3
    and (select count(*) from railway_main.affected_trains) = 4
    and (select count(*) from railway_main.route_recommendations) = 2
    and (select count(*) from railway_main.event_log) >= 3
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @scope invariant
-- @check foreign_key_spot_checks
select
  'foreign_key_spot_checks' as check_name,
  jsonb_build_object(
    'tracks_missing_from_station', (select count(*) from railway_main.tracks tr left join railway_main.stations s on s.id = tr.from_station_id where s.id is null),
    'tracks_missing_to_station', (select count(*) from railway_main.tracks tr left join railway_main.stations s on s.id = tr.to_station_id where s.id is null),
    'schedules_missing_train', (select count(*) from railway_main.train_schedules sch left join railway_main.trains t on t.id = sch.train_id where t.id is null),
    'schedules_missing_station', (select count(*) from railway_main.train_schedules sch left join railway_main.stations s on s.id = sch.station_id where s.id is null),
    'journeys_missing_train', (select count(*) from railway_main.train_journeys tj left join railway_main.trains t on t.id = tj.train_id where t.id is null),
    'disruptions_missing_track', (select count(*) from railway_main.disruptions d left join railway_main.tracks tr on tr.id = d.track_id where d.track_id is not null and tr.id is null),
    'affected_missing_disruption', (select count(*) from railway_main.affected_trains at left join railway_main.disruptions d on d.id = at.disruption_id where d.id is null),
    'recommendations_missing_journey', (select count(*) from railway_main.route_recommendations rr left join railway_main.train_journeys tj on tj.id = rr.train_journey_id where tj.id is null)
  ) as actual,
  'all counts should be 0' as expected,
  case when
    (select count(*) from railway_main.tracks tr left join railway_main.stations s on s.id = tr.from_station_id where s.id is null) = 0
    and (select count(*) from railway_main.tracks tr left join railway_main.stations s on s.id = tr.to_station_id where s.id is null) = 0
    and (select count(*) from railway_main.train_schedules sch left join railway_main.trains t on t.id = sch.train_id where t.id is null) = 0
    and (select count(*) from railway_main.train_schedules sch left join railway_main.stations s on s.id = sch.station_id where s.id is null) = 0
    and (select count(*) from railway_main.train_journeys tj left join railway_main.trains t on t.id = tj.train_id where t.id is null) = 0
    and (select count(*) from railway_main.disruptions d left join railway_main.tracks tr on tr.id = d.track_id where d.track_id is not null and tr.id is null) = 0
    and (select count(*) from railway_main.affected_trains at left join railway_main.disruptions d on d.id = at.disruption_id where d.id is null) = 0
    and (select count(*) from railway_main.route_recommendations rr left join railway_main.train_journeys tj on tj.id = rr.train_journey_id where tj.id is null) = 0
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @check constraint_inventory
select
  'constraint_inventory' as check_name,
  jsonb_object_agg(constraint_type, constraint_count order by constraint_type) as actual,
  'primary key, foreign key, unique, and check constraints should all exist' as expected,
  case when
    count(*) filter (where constraint_type = 'PRIMARY KEY') > 0
    and count(*) filter (where constraint_type = 'FOREIGN KEY') > 0
    and count(*) filter (where constraint_type = 'UNIQUE') > 0
    and count(*) filter (where constraint_type = 'CHECK') > 0
  then 'PASS' else 'FAIL' end as status
from (
  select constraint_type, count(*) as constraint_count
  from information_schema.table_constraints
  where table_schema = 'railway_main'
    and constraint_type in ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
  group by constraint_type
) c;
-- @end

-- @check no_constraint_violating_seed_rows
select
  'no_constraint_violating_seed_rows' as check_name,
  jsonb_build_object(
    'invalid_station_lat_lng', (select count(*) from railway_main.stations where latitude not between -90 and 90 or longitude not between -180 and 180),
    'same_track_endpoints', (select count(*) from railway_main.tracks where from_station_id = to_station_id),
    'nonpositive_track_distance', (select count(*) from railway_main.tracks where distance_km <= 0),
    'nonpositive_speed_limit', (select count(*) from railway_main.tracks where speed_limit_kmph <= 0),
    'same_train_endpoints', (select count(*) from railway_main.trains where source_station_id = destination_station_id),
    'negative_journey_delay', (select count(*) from railway_main.train_journeys where delay_minutes < 0),
    'disruptions_without_target', (select count(*) from railway_main.disruptions where track_id is null and station_id is null),
    'negative_recommendation_scores', (select count(*) from railway_main.route_recommendations where score < 0)
  ) as actual,
  'all counts should be 0' as expected,
  case when
    (select count(*) from railway_main.stations where latitude not between -90 and 90 or longitude not between -180 and 180) = 0
    and (select count(*) from railway_main.tracks where from_station_id = to_station_id) = 0
    and (select count(*) from railway_main.tracks where distance_km <= 0) = 0
    and (select count(*) from railway_main.tracks where speed_limit_kmph <= 0) = 0
    and (select count(*) from railway_main.trains where source_station_id = destination_station_id) = 0
    and (select count(*) from railway_main.train_journeys where delay_minutes < 0) = 0
    and (select count(*) from railway_main.disruptions where track_id is null and station_id is null) = 0
    and (select count(*) from railway_main.route_recommendations where score < 0) = 0
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @check index_inventory
select
  'index_inventory' as check_name,
  jsonb_build_object(
    'total_indexes', count(*),
    'gist_indexes', count(*) filter (where indexdef ilike '% using gist %'),
    'unique_indexes', count(*) filter (where indexdef ilike 'create unique index%')
  ) as actual,
  'expected at least 35 indexes, including 3 GiST spatial indexes' as expected,
  case when count(*) >= 35 and count(*) filter (where indexdef ilike '% using gist %') >= 3
  then 'PASS' else 'FAIL' end as status
from pg_indexes
where schemaname = 'railway_main';
-- @end

-- @check expected_indexes_present
with required(indexname) as (
  values
    ('idx_stations_geom_gist'),
    ('idx_tracks_geom_gist'),
    ('idx_disruptions_geom_gist'),
    ('idx_train_journeys_status_date'),
    ('idx_event_log_status_created_at'),
    ('idx_disruptions_status_started_at')
),
missing as (
  select r.indexname
  from required r
  left join pg_indexes i on i.schemaname = 'railway_main' and i.indexname = r.indexname
  where i.indexname is null
)
select
  'expected_indexes_present' as check_name,
  coalesce(jsonb_agg(indexname order by indexname), '[]'::jsonb) as actual,
  'missing index list should be empty' as expected,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as status
from missing;
-- @end

-- @scope fixture
-- @check history_tables_populated
select
  'history_tables_populated' as check_name,
  jsonb_build_object(
    'track_status_history', (select count(*) from railway_main.track_status_history),
    'train_status_history', (select count(*) from railway_main.train_status_history),
    'journey_delay_history', (select count(*) from railway_main.journey_delay_history),
    'disruption_history', (select count(*) from railway_main.disruption_history)
  ) as actual,
  'all history tables should contain initial seed rows' as expected,
  case when
    (select count(*) from railway_main.track_status_history) = 60
    and (select count(*) from railway_main.train_status_history) = 12
    and (select count(*) from railway_main.journey_delay_history) = 5
    and (select count(*) from railway_main.disruption_history) = 3
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @scope fixture
-- @check postgis_geometry_presence
select
  'postgis_geometry_presence' as check_name,
  jsonb_build_object(
    'stations_with_geom', (select count(*) from railway_main.stations where geom is not null),
    'tracks_with_geom', (select count(*) from railway_main.tracks where geom is not null),
    'disruptions_with_geom', (select count(*) from railway_main.disruptions where geom is not null)
  ) as actual,
  'all stations/tracks and seeded disruptions should have geography values' as expected,
  case when
    (select count(*) from railway_main.stations where geom is not null) = 25
    and (select count(*) from railway_main.tracks where geom is not null) = 60
    and (select count(*) from railway_main.disruptions where geom is not null) = 3
  then 'PASS' else 'FAIL' end as status;
-- @end

-- @scope invariant
-- @check postgis_nearby_station_query
with target as (
  select geom
  from railway_main.disruptions
  where type = 'TRACK_FAILURE'
  limit 1
),
nearby as (
  select s.station_code
  from railway_main.stations s, target t
  where ST_DWithin(s.geom, t.geom, 80000)
)
select
  'postgis_nearby_station_query' as check_name,
  jsonb_build_object('nearby_station_count_80km', count(*)) as actual,
  'should find at least Chengalpattu/Villupuram-area stations inside 80km' as expected,
  case when count(*) >= 2 then 'PASS' else 'FAIL' end as status
from nearby;
-- @end

-- @check postgis_track_distance_query
select
  'postgis_track_distance_query' as check_name,
  jsonb_build_object(
    'min_track_length_m', round(min(ST_Length(geom))::numeric, 2),
    'max_track_length_m', round(max(ST_Length(geom))::numeric, 2)
  ) as actual,
  'track geography lengths should be positive' as expected,
  case when min(ST_Length(geom)) > 0 and max(ST_Length(geom)) > 0
  then 'PASS' else 'FAIL' end as status
from railway_main.tracks;
-- @end

-- @check active_database_trigger_status
select
  'active_database_trigger_status' as check_name,
  jsonb_build_object('user_triggers', count(*)) as actual,
  'Phase 7 active database triggers must be installed' as expected,
  case when count(*) >= 10 then 'PASS' else 'FAIL' end as status
from information_schema.triggers
where trigger_schema = 'railway_main';
-- @end

-- @check views_functions_procedures_status
select
  'views_functions_procedures_status' as check_name,
  jsonb_build_object(
    'views', (
      select count(*) from information_schema.views where table_schema = 'railway_main'
    ),
    'routines', (
      select count(*) from information_schema.routines where specific_schema = 'railway_main'
    )
  ) as actual,
  'Phase 6 should provide at least 5 views and 10 routines including procedures' as expected,
  case when
    (select count(*) from information_schema.views where table_schema = 'railway_main') >= 5
    and (select count(*) from information_schema.routines where specific_schema = 'railway_main') >= 10
  then 'PASS' else 'FAIL' end as status;
-- @end
