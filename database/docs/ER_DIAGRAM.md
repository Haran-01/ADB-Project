# ER Diagram

Phase 7 adds `train_journeys 1 -> many journey_status_history`, a composite `affected_trains(disruption_id,train_journey_id) 1 -> many route_recommendations` relationship, and `logic_artifacts` deployment metadata. Existing diagrams below describe the original Phase 2 baseline; current additions are listed in `DATA_DICTIONARY.md` and `PHASES_7_9_DESIGN.md`.

This document defines the conceptual entity model for the railway disruption database. It is design documentation only; migration SQL belongs in Phase 3.

## Schema Scope

Primary schema for MVP: `railway_main`.

Future logical distribution schemas:

- `railway_north`
- `railway_central`
- `railway_south`

For the MVP, regional separation is represented by the `regions` entity and can later be expanded into regional schemas.

## Entity Relationship Diagram

```mermaid
erDiagram
  REGIONS ||--o{ STATIONS : contains
  REGIONS ||--o{ TRACKS : owns

  STATIONS ||--o{ TRACKS : from_station
  STATIONS ||--o{ TRACKS : to_station
  STATIONS ||--o{ TRAINS : source_station
  STATIONS ||--o{ TRAINS : destination_station
  STATIONS ||--o{ TRAIN_SCHEDULES : scheduled_stop
  STATIONS ||--o{ TRAIN_JOURNEYS : current_station
  STATIONS ||--o{ TRAIN_JOURNEYS : next_station
  STATIONS ||--o{ DISRUPTIONS : station_disruption

  TRAINS ||--o{ TRAIN_SCHEDULES : has_schedule
  TRAINS ||--o{ TRAIN_JOURNEYS : has_journey

  TRACKS ||--o{ DISRUPTIONS : track_disruption
  TRACKS ||--o{ TRACK_STATUS_HISTORY : has_status_history

  TRAIN_JOURNEYS ||--o{ AFFECTED_TRAINS : affected_instance
  TRAIN_JOURNEYS ||--o{ ROUTE_RECOMMENDATIONS : has_recommendation
  TRAIN_JOURNEYS ||--o{ JOURNEY_DELAY_HISTORY : has_delay_history

  DISRUPTIONS ||--o{ AFFECTED_TRAINS : impacts
  DISRUPTIONS ||--o{ ROUTE_RECOMMENDATIONS : produces
  DISRUPTIONS ||--o{ DISRUPTION_HISTORY : has_history

  TRAINS ||--o{ TRAIN_STATUS_HISTORY : has_status_history

  REGIONS {
    uuid id PK
    text code UK
    text name
    text description
    timestamptz created_at
    timestamptz updated_at
  }

  STATIONS {
    uuid id PK
    text station_code UK
    text name
    uuid region_id FK
    text zone
    text state
    numeric latitude
    numeric longitude
    geography point_geom
    station_status status
    timestamptz created_at
    timestamptz updated_at
  }

  TRACKS {
    uuid id PK
    uuid from_station_id FK
    uuid to_station_id FK
    uuid region_id FK
    numeric distance_km
    text track_type
    integer speed_limit_kmph
    track_status status
    geography line_geom
    timestamptz valid_from
    timestamptz valid_to
    timestamptz created_at
    timestamptz updated_at
  }

  TRAINS {
    uuid id PK
    text train_number UK
    text name
    train_type train_type
    integer priority
    uuid source_station_id FK
    uuid destination_station_id FK
    train_status status
    timestamptz created_at
    timestamptz updated_at
  }

  TRAIN_SCHEDULES {
    uuid id PK
    uuid train_id FK
    uuid station_id FK
    integer stop_sequence
    time scheduled_arrival
    time scheduled_departure
    integer day_offset
    text platform
    timestamptz created_at
    timestamptz updated_at
  }

  TRAIN_JOURNEYS {
    uuid id PK
    uuid train_id FK
    date journey_date
    uuid current_station_id FK
    uuid next_station_id FK
    timestamptz actual_arrival
    timestamptz actual_departure
    integer delay_minutes
    journey_status journey_status
    timestamptz created_at
    timestamptz updated_at
  }

  DISRUPTIONS {
    uuid id PK
    disruption_type type
    uuid track_id FK
    uuid station_id FK
    disruption_severity severity
    text reported_by
    text description
    timestamptz started_at
    timestamptz ended_at
    disruption_status status
    geography point_geom
    timestamptz created_at
    timestamptz updated_at
  }

  AFFECTED_TRAINS {
    uuid id PK
    uuid disruption_id FK
    uuid train_journey_id FK
    impact_type impact_type
    integer estimated_delay_minutes
    affected_train_status status
    timestamptz created_at
    timestamptz updated_at
  }

  ROUTE_RECOMMENDATIONS {
    uuid id PK
    uuid disruption_id FK
    uuid train_journey_id FK
    jsonb original_route
    jsonb recommended_route
    numeric distance_km
    integer estimated_travel_minutes
    integer estimated_delay_minutes
    numeric score
    recommendation_status status
    timestamptz created_at
    timestamptz updated_at
  }

  EVENT_LOG {
    uuid id PK
    event_type event_type
    text entity_type
    uuid entity_id
    jsonb payload
    timestamptz created_at
    timestamptz processed_at
    event_status status
  }
```

## Design Notes

- `tracks` represents directional operational connectivity. If a physical track is bidirectional, Phase 4 seed data should either create two directional rows or store a bidirectional flag and let graph sync create two relationships.
- `train_schedules` stores planned stops. `train_journeys` stores a specific running instance of a train on a date.
- `disruptions` supports both track-level and station-level disruptions. At least one of `track_id` or `station_id` must be present.
- `route_recommendations` stores JSON route snapshots because each recommendation is an analysis result, not a normalized master route.
- History tables are append-only audit tables and are intentionally separated from current-state tables.
