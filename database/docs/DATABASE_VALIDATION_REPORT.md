# Database Validation Report

Generated at: 2026-09-13T17:25:12.114Z

Phase 5 validates the Supabase PostgreSQL/PostGIS database before backend APIs are built.

## Summary

- Total checks: 31
- Passed: 31
- Failed: 0

All validation checks passed.

## Validation Files

- `database/sample_queries/validation.sql`
- `database/sample_queries/business_queries.sql`
- `database/sample_queries/phase6_logic_validation.sql`

## Detailed Results

| Check | Source | Status | Actual | Expected |
| --- | --- | --- | --- | --- |
| `active_train_journeys` | `database\sample_queries\business_queries.sql` | PASS | {"active_journeys":12,"delayed_journeys":5} | should return 12 active journey records, including delayed trains |
| `train_schedule_lookup` | `database\sample_queries\business_queries.sql` | PASS | {"last_stop":"MDU","first_stop":"MS","stop_count":7,"train_number":"12635"} | Vaigai Express demo should have 7 ordered stops from MS to MDU |
| `track_availability_lookup` | `database\sample_queries\business_queries.sql` | PASS | {"active_tracks":58,"failed_tracks":0,"maintenance_tracks":2} | seed should have mostly active tracks and 2 maintenance directions |
| `trains_using_disrupted_track` | `database\sample_queries\business_queries.sql` | PASS | {"train_numbers":["12635","16127"]} | should find 2 scheduled trains using CGL -> VM directly |
| `nearest_stations_to_track_failure` | `database\sample_queries\business_queries.sql` | PASS | [{"distance_km":44.72,"station_code":"PDY"},{"distance_km":49.3,"station_code":"CGL"},{"distance_km":49.32,"station_code":"VM"},{"distance_km":78.51,"station_code":"TBM"},{"distance_km":85.89,"station_code":"AJJ"}] | nearest stations should include CGL or VM near the track failure point |
| `unresolved_disruptions` | `database\sample_queries\business_queries.sql` | PASS | {"types":["TRACK_FAILURE","MAINTENANCE"],"open_or_analyzing":2} | should have 2 unresolved disruptions: MAINTENANCE and TRACK_FAILURE |
| `route_recommendation_history` | `database\sample_queries\business_queries.sql` | PASS | {"max_delay":105,"min_score":78.5,"recommendations":2} | should have 2 proposed route recommendations for the track failure |
| `disruption_impact_summary_join` | `database\sample_queries\business_queries.sql` | PASS | {"total_estimated_delay":145,"track_failure_affected_trains":4} | track failure should have 4 affected train rows and 145 total estimated delay minutes |
| `event_log_pending_work` | `database\sample_queries\business_queries.sql` | PASS | {"pending_events":2,"processed_events":1} | unresolved disruptions should leave pending event work for later workers |
| `schedule_to_track_join_coverage` | `database\sample_queries\business_queries.sql` | PASS | {"matched_tracks":68,"schedule_edges":68} | every consecutive scheduled stop pair should map to a track row |
| `phase6_expected_views_present` | `database\sample_queries\phase6_logic_validation.sql` | PASS | [] | missing view list should be empty |
| `phase6_active_views_return_rows` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"schedule_rows":80,"active_disruptions":2,"track_network_rows":60,"impact_summary_rows":3,"active_train_journeys":12} | views should expose seeded operational data |
| `phase6_get_train_schedule_function` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"last_stop":"MDU","first_stop":"MS","stop_count":7,"train_number":"12635"} | fn_get_train_schedule(text) should return 7 stops for train 12635 |
| `phase6_track_availability_function` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"status":"ACTIVE","is_available":true} | CGL -> VM demo track should currently be available before Phase 7 trigger simulation |
| `phase6_nearby_stations_function` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"nearby_count_80km":4} | fn_find_nearby_stations should find at least 2 nearby stations |
| `phase6_delay_estimation_function` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"low_delay":66,"high_delay":90} | higher severity should produce greater delay estimate |
| `phase6_disruption_context_function` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"rows":1,"to_station_code":"VM","from_station_code":"CGL"} | track failure context should resolve CGL -> VM |
| `phase6_find_trains_using_track_function` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"train_numbers":["12635","16127"]} | function should find trains 12635 and 16127 using CGL -> VM |
| `phase6_procedure_record_affected_train` | `database\sample_queries\phase6_logic_validation.sql` | PASS | {"delay":45,"affected_rows_for_12635":1} | procedure should upsert existing affected train row without duplicating it |
| `table_counts` | `database\sample_queries\validation.sql` | PASS | {"tracks":60,"trains":12,"regions":1,"stations":25,"event_log":3,"disruptions":3,"train_journeys":12,"affected_trains":4,"train_schedules":80,"route_recommendations":2} | {"tracks":60,"trains":12,"regions":1,"stations":25,"event_log":3,"disruptions":3,"train_journeys":12,"affected_trains":4,"train_schedules":80,"route_recommendations":2} |
| `foreign_key_spot_checks` | `database\sample_queries\validation.sql` | PASS | {"journeys_missing_train":0,"schedules_missing_train":0,"disruptions_missing_track":0,"schedules_missing_station":0,"tracks_missing_to_station":0,"affected_missing_disruption":0,"tracks_missing_from_station":0,"recommendations_missing_journey":0} | all counts should be 0 |
| `constraint_inventory` | `database\sample_queries\validation.sql` | PASS | {"CHECK":137,"UNIQUE":9,"FOREIGN KEY":21,"PRIMARY KEY":15} | primary key, foreign key, unique, and check constraints should all exist |
| `no_constraint_violating_seed_rows` | `database\sample_queries\validation.sql` | PASS | {"same_track_endpoints":0,"same_train_endpoints":0,"negative_journey_delay":0,"invalid_station_lat_lng":0,"nonpositive_speed_limit":0,"disruptions_without_target":0,"nonpositive_track_distance":0,"negative_recommendation_scores":0} | all counts should be 0 |
| `index_inventory` | `database\sample_queries\validation.sql` | PASS | {"gist_indexes":3,"total_indexes":57,"unique_indexes":24} | expected at least 35 indexes, including 3 GiST spatial indexes |
| `expected_indexes_present` | `database\sample_queries\validation.sql` | PASS | [] | missing index list should be empty |
| `history_tables_populated` | `database\sample_queries\validation.sql` | PASS | {"disruption_history":3,"track_status_history":60,"train_status_history":12,"journey_delay_history":5} | all history tables should contain initial seed rows |
| `postgis_geometry_presence` | `database\sample_queries\validation.sql` | PASS | {"tracks_with_geom":60,"stations_with_geom":25,"disruptions_with_geom":3} | all stations/tracks and seeded disruptions should have geography values |
| `postgis_nearby_station_query` | `database\sample_queries\validation.sql` | PASS | {"nearby_station_count_80km":4} | should find at least Chengalpattu/Villupuram-area stations inside 80km |
| `postgis_track_distance_query` | `database\sample_queries\validation.sql` | PASS | {"max_track_length_m":153118.66,"min_track_length_m":9184.86} | track geography lengths should be positive |
| `active_database_trigger_status` | `database\sample_queries\validation.sql` | PASS | {"user_triggers":0} | 0 expected in Phase 5 because triggers are intentionally Phase 7 work |
| `views_functions_procedures_status` | `database\sample_queries\validation.sql` | PASS | {"views":5,"routines":11} | Phase 6 should provide at least 5 views and 10 routines including procedures |

## Scope Notes

- Trigger behavior is intentionally reported as not present yet because active triggers belong to Phase 7.
- Phase 6 views, functions, and procedures are now expected to exist and are validated here.
- This validation proves seeded relational joins, constraints, indexes, history rows, PostGIS queries, core business queries, and SQL-first database logic work directly in PostgreSQL.
