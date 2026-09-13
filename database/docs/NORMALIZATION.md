# Normalization

This document explains how the planned database satisfies normalization through at least Third Normal Form.

## First Normal Form

First Normal Form requires:

- each table has a primary key.
- each column contains atomic values.
- repeating groups are removed.

Design choices:

- Each entity has a single `uuid` primary key.
- Station location is split into latitude, longitude, and a PostGIS `geom` value. The geometry is a typed spatial value, not a delimited string.
- Train schedules are represented as one row per train stop instead of storing stop lists in a single field.
- Route recommendations store JSON snapshots because a recommendation is an analysis artifact. The operational master data remains normalized in stations, tracks, trains, schedules, and journeys.

## Second Normal Form

Second Normal Form requires:

- the table is in 1NF.
- non-key attributes depend on the whole key.

Most tables use surrogate `uuid` primary keys. Natural uniqueness is enforced with unique constraints such as:

- `regions.code`
- `stations.station_code`
- `trains.train_number`
- `(train_schedules.train_id, train_schedules.stop_sequence)`
- `(train_journeys.train_id, train_journeys.journey_date)`
- `(affected_trains.disruption_id, affected_trains.train_journey_id)`

Design choices:

- Train schedule stop details depend on the schedule row, while the train name remains in `trains`.
- Station names and locations remain in `stations`, not duplicated in schedules or disruptions.
- Track details remain in `tracks`, not duplicated in disruptions or route recommendations.

## Third Normal Form

Third Normal Form requires:

- the table is in 2NF.
- non-key attributes do not depend on other non-key attributes.

Design choices:

- Region details are stored in `regions`; stations and tracks reference `region_id`.
- Train source and destination reference `stations`; station names are not copied into `trains`.
- Current train operation state is stored in `train_journeys`; master train data is stored in `trains`.
- Disruption impact is stored in `affected_trains`; the disruption details remain in `disruptions`.
- Route alternatives are stored in `route_recommendations`; affected train status remains in `affected_trains`.
- History tables store status transitions separately from current-state tables.

## Controlled Denormalization

Some controlled denormalization is intentional:

- `route_recommendations.original_route` and `route_recommendations.recommended_route` are JSONB snapshots. This preserves the exact route evaluated at analysis time even if station or track records later change.
- `distance_km` exists on `tracks` even though it can be derived from geometry. This supports fast routing and deterministic scoring.
- `delay_minutes` exists on `train_journeys` for current operational state, while `journey_delay_history` preserves change history.

These choices are acceptable because they support auditability and performance without making PostgreSQL stop being the source of truth.

## Spatial Normalization

Spatial data is stored with clear ownership:

- Station point geometry belongs to `stations`.
- Track line geometry belongs to `tracks`.
- Disruption point geometry belongs to `disruptions`.

Spatial query results such as nearby stations are not stored as permanent rows unless they become part of an analysis result.

## Graph Projection Normalization

Neo4j is not the source of truth. It is a derived projection:

- Station nodes originate from `stations`.
- Track relationships originate from `tracks`.
- Relationship properties originate from PostgreSQL columns.

If PostgreSQL changes, Neo4j must be resynchronized. This prevents graph data from becoming an independent conflicting database.

