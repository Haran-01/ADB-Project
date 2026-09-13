# Relationship Diagram

This document describes entity relationships, cardinality, and business meaning. It complements `ER_DIAGRAM.md`.

## Core Master Relationships

| Parent | Child | Cardinality | Relationship |
| --- | --- | --- | --- |
| `regions` | `stations` | 1 to many | A region contains many stations. |
| `regions` | `tracks` | 1 to many | A track segment belongs to one operating region for MVP routing. |
| `stations` | `tracks.from_station_id` | 1 to many | A station can be the origin of many track segments. |
| `stations` | `tracks.to_station_id` | 1 to many | A station can be the destination of many track segments. |
| `stations` | `trains.source_station_id` | 1 to many | A station can be the source for many trains. |
| `stations` | `trains.destination_station_id` | 1 to many | A station can be the destination for many trains. |

## Operational Relationships

| Parent | Child | Cardinality | Relationship |
| --- | --- | --- | --- |
| `trains` | `train_schedules` | 1 to many | A train has many scheduled station stops. |
| `stations` | `train_schedules` | 1 to many | A station appears in many train schedules. |
| `trains` | `train_journeys` | 1 to many | A train can run on many dates. |
| `stations` | `train_journeys.current_station_id` | 1 to many | A running journey can currently be at a station. |
| `stations` | `train_journeys.next_station_id` | 1 to many | A running journey can be heading to a station. |

## Disruption Relationships

| Parent | Child | Cardinality | Relationship |
| --- | --- | --- | --- |
| `tracks` | `disruptions` | 1 to many | A track can have many disruption records over time. |
| `stations` | `disruptions` | 1 to many | A station can have many disruption records over time. |
| `disruptions` | `affected_trains` | 1 to many | A disruption can affect many train journeys. |
| `train_journeys` | `affected_trains` | 1 to many | A train journey can be affected by many disruptions. |
| `disruptions` | `route_recommendations` | 1 to many | A disruption can produce many route recommendations. |
| `train_journeys` | `route_recommendations` | 1 to many | A journey can receive multiple candidate recommendations. |

## History Relationships

| Parent | Child | Cardinality | Relationship |
| --- | --- | --- | --- |
| `tracks` | `track_status_history` | 1 to many | Tracks have append-only status history. |
| `trains` | `train_status_history` | 1 to many | Trains have append-only status history. |
| `train_journeys` | `journey_delay_history` | 1 to many | Journeys have append-only delay history. |
| `disruptions` | `disruption_history` | 1 to many | Disruptions have append-only status/history events. |

## Business Rules

- A station must belong to exactly one region.
- A track must connect two different stations.
- A train must have distinct source and destination stations.
- A schedule stop sequence must be unique per train.
- A journey is unique for a train and journey date.
- A disruption must reference either a track or a station.
- A track disruption should reference `track_id`.
- A station closure should reference `station_id`.
- A route recommendation must reference both the disruption and the affected train journey.
- History rows are append-only and should not be updated by normal application workflows.

## Regional Distribution Model

For the MVP, all base tables live in Supabase PostgreSQL under a main schema such as `railway_main`, with a `region_id` on regional entities.

For the distributed database demonstration, there are two acceptable expansions:

1. Logical regional schemas inside one Supabase database:
   - `railway_north`
   - `railway_central`
   - `railway_south`

2. Separate PostgreSQL databases or Supabase projects connected through `postgres_fdw`.

The MVP should use option 1 first because it is easier to demonstrate and validate.

