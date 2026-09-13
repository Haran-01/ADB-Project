# Database Logic Plan

This document defines which behavior belongs in PostgreSQL, which behavior belongs in Neo4j, and which behavior is later orchestrated by the backend.

## Source of Truth

PostgreSQL/Supabase is the authoritative database.

Neo4j Aura is a synchronized read-optimized graph projection. Neo4j must be rebuilt from PostgreSQL data and must not be used as the system of record.

## SQL-First Logic

The following logic should be implemented in PostgreSQL views, functions, procedures, or sample queries before backend APIs are written.

### Views

Planned views:

| View | Purpose |
| --- | --- |
| `v_active_disruptions` | Open/analyzing disruptions with station/track names. |
| `v_active_train_journeys` | Running/delayed/rerouted journeys with train and station details. |
| `v_track_network` | Track rows enriched with station names, codes, and region details. |
| `v_train_schedule_ordered` | Train schedules ordered by stop sequence. |
| `v_disruption_impact_summary` | Counts affected trains and recommendation states per disruption. |

### Functions

Planned PostgreSQL functions:

| Function | Purpose |
| --- | --- |
| `fn_find_trains_using_track(track_id, journey_date)` | Finds active journeys whose remaining path is affected by a track. |
| `fn_get_train_schedule(train_id)` | Returns ordered schedule stops. |
| `fn_get_active_track_availability(track_id, at_time)` | Checks whether a track is available at a time. |
| `fn_find_nearby_stations(point_geom, radius_km)` | Uses PostGIS to return nearby active stations. |
| `fn_estimate_delay_minutes(extra_distance_km, speed_limit_kmph, severity)` | Provides deterministic delay estimate for MVP. |
| `fn_get_disruption_context(disruption_id)` | Returns track/station/disruption details needed by analysis. |

### Procedures

Planned procedures:

| Procedure | Purpose |
| --- | --- |
| `sp_record_affected_train(disruption_id, train_journey_id, impact_type, delay)` | Inserts or updates affected train row. |
| `sp_store_route_recommendation(...)` | Stores route recommendation and keeps status consistent. |
| `sp_mark_disruption_analyzed(disruption_id)` | Updates disruption status and writes history. |
| `sp_apply_route_recommendation(recommendation_id)` | Applies a recommendation to affected train/journey status. |

## Trigger Plan

Triggers belong in Phase 7, but their behavior is designed here.

| Trigger | Event | Action |
| --- | --- | --- |
| `trg_track_status_history` | `tracks.status` changes | Insert `track_status_history`. |
| `trg_track_failure_disruption` | `tracks.status` changes from `ACTIVE` to `FAILED` | Insert `disruptions` row. |
| `trg_disruption_event_log` | `disruptions` inserted | Insert `event_log` row and notify backend worker. |
| `trg_disruption_history` | `disruptions.status` changes | Insert `disruption_history`. |
| `trg_train_status_history` | `trains.status` changes | Insert `train_status_history`. |
| `trg_journey_delay_history` | `train_journeys.delay_minutes` changes | Insert `journey_delay_history`. |

## PostGIS Logic

PostGIS logic should remain in PostgreSQL.

Planned spatial operations:

- Build station `geom` from longitude/latitude.
- Build track `geom` from station points for MVP seed data.
- Find stations within an impact radius using `ST_DWithin`.
- Rank stations by distance using `ST_Distance`.
- Return map-ready GeoJSON for stations and tracks.
- Identify tracks near a disruption point.

## Neo4j Synchronization Plan

Neo4j data should be produced by a sync script after PostgreSQL seed data exists.

### Station Nodes

Neo4j node label: `Station`

Properties copied from PostgreSQL:

- `stationId`
- `stationCode`
- `name`
- `regionCode`
- `latitude`
- `longitude`
- `status`

### Track Relationships

Neo4j relationship type: `CONNECTED_TO`

Properties copied from PostgreSQL:

- `trackId`
- `distanceKm`
- `speedLimitKmph`
- `travelMinutes`
- `status`
- `regionCode`

### Sync Rules

- Clear graph projection before full rebuild in MVP.
- Read stations and tracks only from PostgreSQL.
- Create relationships only for track rows that exist in PostgreSQL.
- Treat unavailable tracks as relationships with status, not as deleted business data.
- Route queries must ignore relationships with `FAILED`, `BLOCKED`, or `MAINTENANCE`.

## Backend Responsibility Later

Backend should orchestrate, not replace database logic.

Later backend responsibilities:

- Call PostgreSQL functions/procedures.
- Run Neo4j route search.
- Store route recommendations back in PostgreSQL.
- Listen to PostgreSQL `NOTIFY`.
- Publish Socket.IO events.
- Validate API input.

Backend should not duplicate:

- affected train SQL.
- status history behavior.
- route availability SQL.
- PostGIS nearby station logic.
- reporting aggregations already defined as views.

## Analysis Flow

1. Track or station disruption is created in PostgreSQL.
2. Trigger writes `event_log`.
3. Backend worker later receives notification.
4. Worker calls SQL function to get disruption context.
5. Worker calls SQL function/view to identify affected journeys.
6. Worker calls SQL/PostGIS function for nearby stations.
7. Worker queries Neo4j for route alternatives.
8. Worker calls PostgreSQL procedure to store recommendation.
9. PostgreSQL remains the final persisted state.

