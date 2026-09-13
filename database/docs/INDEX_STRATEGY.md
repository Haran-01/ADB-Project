# Index Strategy

This document defines planned indexes for PostgreSQL/PostGIS. Exact SQL belongs in Phase 3 and Phase 8.

## Indexing Goals

- Support common lookup APIs.
- Support SQL-first business logic.
- Support spatial analysis.
- Support trigger/event processing.
- Support validation and reporting queries.
- Avoid over-indexing during MVP.

## Primary and Unique Indexes

Every primary key creates a primary index.

Planned unique indexes:

| Table | Columns | Purpose |
| --- | --- | --- |
| `regions` | `code` | Region lookup by code. |
| `stations` | `station_code` | Station lookup and data import matching. |
| `trains` | `train_number` | Train lookup by public train number. |
| `tracks` | `from_station_id`, `to_station_id` | Prevent duplicate directional track rows in MVP. |
| `train_schedules` | `train_id`, `stop_sequence` | Fast ordered schedule lookup. |
| `train_journeys` | `train_id`, `journey_date` | One journey per train per date. |
| `affected_trains` | `disruption_id`, `train_journey_id` | Prevent duplicate impact rows. |

## Foreign Key Indexes

Create indexes on all foreign key columns used in joins.

| Table | Column |
| --- | --- |
| `stations` | `region_id` |
| `tracks` | `from_station_id` |
| `tracks` | `to_station_id` |
| `tracks` | `region_id` |
| `trains` | `source_station_id` |
| `trains` | `destination_station_id` |
| `train_schedules` | `train_id` |
| `train_schedules` | `station_id` |
| `train_journeys` | `train_id` |
| `train_journeys` | `current_station_id` |
| `train_journeys` | `next_station_id` |
| `disruptions` | `track_id` |
| `disruptions` | `station_id` |
| `affected_trains` | `disruption_id` |
| `affected_trains` | `train_journey_id` |
| `route_recommendations` | `disruption_id` |
| `route_recommendations` | `train_journey_id` |

## Status and Time Indexes

| Table | Columns | Purpose |
| --- | --- | --- |
| `tracks` | `status` | Find unavailable tracks. |
| `stations` | `status` | Find closed/active stations. |
| `train_journeys` | `journey_status`, `journey_date` | Active journey dashboard. |
| `disruptions` | `status`, `started_at` | Active disruption dashboard. |
| `event_log` | `status`, `created_at` | Worker event processing. |
| `track_status_history` | `track_id`, `changed_at` | Track audit timeline. |
| `train_status_history` | `train_id`, `changed_at` | Train audit timeline. |
| `journey_delay_history` | `train_journey_id`, `changed_at` | Delay audit timeline. |
| `disruption_history` | `disruption_id`, `changed_at` | Disruption audit timeline. |

## Spatial Indexes

Use GiST indexes for geography columns.

| Table | Column | Purpose |
| --- | --- | --- |
| `stations` | `geom` | Nearby station lookup with `ST_DWithin`. |
| `tracks` | `geom` | Affected track lookup with spatial intersection/distance. |
| `disruptions` | `geom` | Disruption impact radius queries. |

## JSONB Indexes

Avoid broad JSONB indexes during the first MVP unless validation shows a need.

Potential future indexes:

- `route_recommendations.recommended_route` with GIN for route-inspection queries.
- `event_log.payload` with GIN for event diagnostics.

## Index Validation Plan

Phase 5 validation should run:

- `EXPLAIN` on active journeys query.
- `EXPLAIN` on affected train detection query.
- `EXPLAIN` on active disruption query.
- `EXPLAIN` on nearby station PostGIS query.
- `EXPLAIN` on event worker pending-event query.

Indexes should be added only when they support an actual query pattern.

