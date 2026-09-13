# Intelligent Railway Network and Disruption Management System - Project Plan

## 1. Source Understanding

The attached abstract describes a database-driven railway disruption management system. Its purpose is to monitor railway operations and respond to unexpected disruptions such as track failures, accidents, maintenance activities, station closures, and route blockages.

The project must demonstrate five advanced database concepts:

- Distributed Database: railway data split across regional PostgreSQL databases such as North, Central, and South.
- Spatial Database: station coordinates, track geometry, distance, nearby stations, and affected areas using PostGIS.
- Graph Database: stations as nodes and tracks as edges in Neo4j, used to find alternate paths.
- Temporal Database: schedules, train journey status, delays, track availability, and disruption history over time.
- Active Database: PostgreSQL triggers and functions that react when events occur, such as a track status changing from `ACTIVE` to `FAILED`.

The planned stack from the abstract is:

- Frontend: React, Vite, CSS or Tailwind CSS.
- Backend: Node.js and Express.js.
- Real-time updates: Socket.IO or WebSocket.
- Main relational database: PostgreSQL.
- Spatial database: PostgreSQL with PostGIS.
- Graph database: Neo4j.
- Active rules: PostgreSQL triggers and functions.
- API communication: REST APIs.

## 2. Core Problem Statement

Build a railway operations dashboard that can:

1. Store railway network, train, route, schedule, and journey data.
2. Simulate or record railway disruptions.
3. Automatically identify affected trains.
4. Find nearby operational stations and connection points.
5. Generate alternate routes that avoid blocked tracks.
6. Validate those routes against schedule and track availability.
7. Estimate additional delay or travel time.
8. Persist the decision and show it to an operator in real time.

## 3. Recommended MVP Scope

The first implementation should be a simulation-backed academic MVP, not a full national railway operations platform.

MVP features:

- Admin dashboard showing stations, tracks, trains, and active disruptions.
- Map view with station points and track lines.
- Disruption simulator where an operator marks a track or station as blocked.
- Automatic trigger-driven disruption event creation.
- Affected train detection.
- Alternate route generation using Neo4j shortest path.
- Spatial lookup for nearby stations using PostGIS.
- Temporal validation for route availability at a requested time.
- Real-time UI update when disruption analysis completes.
- History view for disruptions, decisions, and delay impact.

Out of scope for MVP:

- Live Indian Railways integration.
- Passenger-facing booking or notification system.
- Exact railway signaling logic.
- Production-grade dispatch optimization.
- Machine learning delay prediction, unless added as an enhancement.

## 4. Data Model Overview

Use PostgreSQL as the system of record. Use PostGIS columns for geometry. Use Neo4j as a graph projection generated from the PostgreSQL station and track tables.

### PostgreSQL Core Tables

#### regions

- `id`
- `code`
- `name`
- `description`

Purpose: supports the distributed database concept.

#### stations

- `id`
- `station_code`
- `name`
- `region_id`
- `zone`
- `state`
- `latitude`
- `longitude`
- `geom geography(Point, 4326)`
- `status`: `ACTIVE`, `CLOSED`, `MAINTENANCE`

Purpose: spatial station lookup and route endpoints.

#### tracks

- `id`
- `from_station_id`
- `to_station_id`
- `region_id`
- `distance_km`
- `track_type`
- `speed_limit_kmph`
- `status`: `ACTIVE`, `FAILED`, `MAINTENANCE`, `BLOCKED`
- `geom geography(LineString, 4326)`
- `valid_from`
- `valid_to`

Purpose: track availability, spatial display, graph edges.

#### trains

- `id`
- `train_number`
- `name`
- `train_type`
- `priority`
- `source_station_id`
- `destination_station_id`
- `status`: `SCHEDULED`, `RUNNING`, `DELAYED`, `REROUTED`, `CANCELLED`

Purpose: train master data.

#### train_schedules

- `id`
- `train_id`
- `station_id`
- `stop_sequence`
- `scheduled_arrival`
- `scheduled_departure`
- `day_offset`
- `platform`

Purpose: temporal schedule data.

#### train_journeys

- `id`
- `train_id`
- `journey_date`
- `current_station_id`
- `next_station_id`
- `actual_arrival`
- `actual_departure`
- `delay_minutes`
- `journey_status`

Purpose: live or simulated temporal journey state.

#### disruptions

- `id`
- `type`: `TRACK_FAILURE`, `ACCIDENT`, `MAINTENANCE`, `STATION_CLOSURE`, `ROUTE_BLOCKAGE`
- `track_id`
- `station_id`
- `severity`
- `reported_by`
- `description`
- `started_at`
- `ended_at`
- `status`: `OPEN`, `ANALYZING`, `RESOLVED`
- `geom geography(Point, 4326)`

Purpose: disruption event record.

#### affected_trains

- `id`
- `disruption_id`
- `train_journey_id`
- `impact_type`
- `estimated_delay_minutes`
- `status`: `PENDING`, `REROUTED`, `WAITING`, `CANCELLED`

Purpose: links disruption events to affected running trains.

#### route_recommendations

- `id`
- `disruption_id`
- `train_journey_id`
- `original_route_json`
- `recommended_route_json`
- `distance_km`
- `estimated_travel_minutes`
- `estimated_delay_minutes`
- `score`
- `status`: `PROPOSED`, `ACCEPTED`, `REJECTED`, `APPLIED`

Purpose: stores graph and temporal analysis output.

#### event_log

- `id`
- `event_type`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`
- `processed_at`
- `status`

Purpose: active database event trail.

## 5. Distributed Database Design

For the academic demonstration, create multiple PostgreSQL schemas or databases:

- `railway_north`
- `railway_central`
- `railway_south`
- `railway_main`

Recommended approach:

- Keep global reference data in `railway_main`.
- Keep region-specific station, track, route, and schedule partitions in regional databases or schemas.
- Use PostgreSQL Foreign Data Wrapper (`postgres_fdw`) to query regional data from the main database.

Why this is practical:

- It proves distributed data access without requiring multiple physical machines.
- It lets you demonstrate cross-region train journeys.
- It keeps the implementation manageable for a student project.

Example flow:

1. A train starts in South and travels through Central.
2. A Central region track fails.
3. Main backend queries Central tables for affected tracks and South/Central schedules for affected trains.
4. The final recommendation is written back to main history tables.

## 6. Spatial Database Design

Use PostGIS for:

- Station coordinates.
- Track line geometries.
- Distance between stations.
- Nearby station lookup.
- Disruption impact radius.
- Map rendering data.

Important PostGIS queries:

- `ST_DWithin`: find stations or tracks within a radius.
- `ST_Distance`: rank nearest stations.
- `ST_Intersects`: identify tracks intersecting a disruption zone.
- `ST_MakeLine`: create track geometry between station points when real track geometry is unavailable.

MVP spatial behavior:

- If a track fails, find stations within 25-50 km.
- Identify neighboring tracks that can reconnect the route.
- Return GeoJSON to the frontend map.

## 7. Graph Database Design

Use Neo4j for route search.

Node:

```cypher
(:Station {
  stationId,
  code,
  name,
  region,
  latitude,
  longitude,
  status
})
```

Relationship:

```cypher
(:Station)-[:CONNECTED_TO {
  trackId,
  distanceKm,
  speedLimitKmph,
  status,
  travelMinutes,
  region
}]->(:Station)
```

Route search:

- Exclude `FAILED`, `BLOCKED`, and `MAINTENANCE` tracks.
- Prefer lowest `travelMinutes` or `distanceKm`.
- Return top 3 alternatives.

Good MVP algorithm:

1. Remove or ignore unavailable edges.
2. Run weighted shortest path from current station to destination.
3. Score candidate routes by distance, travel time, number of hops, and track availability.
4. Send the best recommendation to PostgreSQL.

## 8. Temporal Database Design

The system needs to know whether a route is available at a specific time, not just whether it exists.

Use:

- `valid_from` and `valid_to` on track availability.
- `started_at` and `ended_at` on disruptions.
- schedule timestamps with day offsets.
- history tables for status changes.

Temporal checks:

- Is the track available during the train's expected arrival window?
- Is another disruption active on the candidate route?
- Is the train already delayed enough to miss planned timing?
- Was the same route blocked earlier?

Recommended history tables:

- `track_status_history`
- `train_status_history`
- `journey_delay_history`
- `disruption_history`

## 9. Active Database Rules

Use PostgreSQL triggers for event detection.

Key triggers:

1. When `tracks.status` changes from `ACTIVE` to `FAILED`, insert a `disruptions` row.
2. When a `disruptions` row is inserted, insert an `event_log` row.
3. When `event_log.event_type = DISRUPTION_CREATED`, notify the backend worker.
4. When route recommendations are inserted, update affected train status.

Implementation options:

- PostgreSQL trigger plus `LISTEN/NOTIFY` to wake the Node.js backend.
- Backend worker then performs cross-database, spatial, graph, and temporal analysis.
- Socket.IO publishes the result to frontend clients.

This keeps the database active without putting all business logic inside SQL.

## 10. Backend Architecture

Recommended Node.js modules:

- `src/config`: environment and database clients.
- `src/db/postgres`: PostgreSQL pool and query helpers.
- `src/db/neo4j`: Neo4j driver setup.
- `src/modules/stations`
- `src/modules/tracks`
- `src/modules/trains`
- `src/modules/schedules`
- `src/modules/disruptions`
- `src/modules/routing`
- `src/modules/events`
- `src/realtime`: Socket.IO server.

Recommended services:

- `DisruptionService`: create/update disruptions.
- `AffectedTrainService`: find impacted journeys.
- `SpatialService`: nearby stations and affected geometry.
- `GraphRoutingService`: alternate path search in Neo4j.
- `TemporalValidationService`: schedule and availability checks.
- `RecommendationService`: score alternatives.
- `EventWorker`: listens to PostgreSQL events and runs the workflow.

## 11. API Plan

### Station and Network APIs

- `GET /api/stations`
- `GET /api/stations/:id`
- `GET /api/tracks`
- `GET /api/network/map`

### Train APIs

- `GET /api/trains`
- `GET /api/trains/:id`
- `GET /api/journeys/active`
- `GET /api/trains/:id/schedule`

### Disruption APIs

- `GET /api/disruptions`
- `POST /api/disruptions`
- `PATCH /api/disruptions/:id/resolve`
- `POST /api/simulations/track-failure`
- `POST /api/simulations/station-closure`

### Analysis APIs

- `GET /api/disruptions/:id/affected-trains`
- `GET /api/disruptions/:id/recommendations`
- `POST /api/disruptions/:id/analyze`
- `POST /api/recommendations/:id/apply`

### Real-Time Events

Socket.IO events:

- `disruption.created`
- `disruption.analysis_started`
- `disruption.analysis_completed`
- `train.affected`
- `route.recommended`
- `train.status_updated`

## 12. Disruption Workflow

1. Operator reports a disruption, or simulator marks a track as failed.
2. PostgreSQL trigger records the event.
3. Backend receives database notification.
4. Backend identifies trains whose planned route uses the failed track.
5. PostGIS finds nearby stations and connection points.
6. Neo4j finds alternate paths that avoid blocked edges.
7. Temporal validation checks schedule feasibility and active disruptions.
8. Backend scores alternatives.
9. Best route is stored in `route_recommendations`.
10. Affected train status is updated.
11. Frontend receives live update and displays result.

## 13. Dataset Options

Use a combination of real network data and synthetic operational/disruption data.

Recommended datasets:

1. OpenStreetMap / Geofabrik India extract
   - Best for railway tracks and map geometries.
   - Useful for PostGIS and map view.
   - Source: https://download.geofabrik.de/asia/india.html

2. India Geodata railway files
   - Provides railway tracks and stations in convenient GeoJSON, GeoJSONL, Parquet, and PMTiles-style formats.
   - Easier than processing the full OSM PBF for an MVP.
   - Source: https://yashveeeeeeer.github.io/india-geodata/

3. Kaggle Indian Railways Dataset
   - Provides stations, trains, and schedules.
   - Useful for seed data.
   - Source: https://www.kaggle.com/datasets/sripaadsrinivasan/indian-railways-dataset

4. Kaggle Indian Trains
   - Provides train and schedule CSV files.
   - Good for relational import into PostgreSQL.
   - Source: https://www.kaggle.com/datasets/dnyaneshyeole/indian-trains

5. Indian stations CSV gist
   - Station codes with latitude and longitude.
   - Useful as a quick fallback station master file.
   - Source: https://gist.github.com/synsh/5a0866b1b637ad516a5d2d3a040660a8

6. Data.gov.in railway accident and derailment datasets
   - Useful for disruption type examples and academic context.
   - Source: https://www.data.gov.in/catalog/number-persons-killed-and-injured-railway-related-accidents
   - Source: https://www.data.gov.in/keywords/Derailment

7. Delay datasets
   - Useful only if you add delay prediction or richer delay analytics.
   - Source: https://www.kaggle.com/datasets/naijilaji/indian-railways-passenger-train-delays-dataset/data
   - Source: https://www.kaggle.com/competitions/indian-railways-predict-train-delay/data

Recommended MVP data choice:

- Use India Geodata or OSM for stations/tracks.
- Use Kaggle Indian Railways or Indian Trains for train schedules.
- Generate synthetic disruptions and journey status records.
- Generate synthetic delay estimates from distance, speed, train priority, and disruption severity.

## 14. Data Ingestion Plan

1. Normalize station codes across datasets.
2. Import stations into PostgreSQL.
3. Import track geometries into PostGIS.
4. Import train master and schedule data.
5. Build graph edges:
   - From schedule consecutive stops if exact track edges are hard to match.
   - From track geometry if station-to-station track data is clean.
6. Push station nodes and connected track edges into Neo4j.
7. Seed active train journeys for a selected simulation date.
8. Seed sample disruptions for demo scenarios.

Practical MVP simplification:

- Pick one region first, such as Tamil Nadu / Southern Railway, instead of full India.
- Use 50-150 stations and 20-50 trains for the demo.
- Expand only after the workflow is correct.

## 15. Frontend Plan

The frontend should be an operator dashboard, not a marketing page.

Core views:

1. Operations Map
   - Track lines.
   - Station markers.
   - Active disruption markers.
   - Highlighted affected route and recommended route.

2. Disruption Control Panel
   - Create/simulate disruption.
   - Select track/station.
   - Choose disruption type and severity.
   - Start analysis.
   - Resolve disruption.

3. Affected Trains Table
   - Train number and name.
   - Current location.
   - Destination.
   - Impact type.
   - Estimated delay.
   - Recommendation status.

4. Route Recommendation Panel
   - Original route.
   - Alternate route.
   - Distance difference.
   - Expected delay.
   - Availability result.
   - Accept/apply button.

5. Timeline / History
   - Event created.
   - Trigger fired.
   - Affected trains found.
   - Alternate routes generated.
   - Recommendation applied.

Suggested frontend libraries:

- React with Vite.
- Tailwind CSS.
- Leaflet or MapLibre for maps.
- Socket.IO client for live updates.
- TanStack Query for API state.
- React Router for navigation.
- Recharts for delay and disruption analytics.

## 16. Implementation Phases

### Phase 1 - Cloud Database Foundation

- Create backend and frontend folders.
- Configure Supabase PostgreSQL/PostGIS as the source-of-truth database.
- Configure Neo4j Aura as the read-optimized graph routing projection.
- Document cloud connection details and environment variables.
- Do not set up backend APIs or frontend screens until the database foundation is designed, migrated, seeded, and validated.

### Phase 2 - Relational and Spatial Database

- Create PostgreSQL schema.
- Enable PostGIS.
- Add tables, indexes, constraints, and seed scripts.
- Import stations and tracks.
- Build map data endpoint.

### Phase 3 - Graph Projection

- Create Neo4j station nodes and track relationships.
- Add graph sync script.
- Implement alternate route search.

### Phase 4 - Temporal and Active Rules

- Add schedule and journey tables.
- Add history tables.
- Create triggers for track status changes.
- Add PostgreSQL `LISTEN/NOTIFY`.

### Phase 5 - Disruption Analysis Backend

- Implement affected train detection.
- Implement spatial nearby station lookup.
- Implement graph route search.
- Implement temporal feasibility checks.
- Implement recommendation scoring.

### Phase 6 - Frontend Dashboard

- Build map view.
- Build disruption simulator.
- Build affected trains table.
- Build recommendation panel.
- Add real-time event updates.

### Phase 7 - Demo and Documentation

- Seed 3-5 demo disruption scenarios.
- Add screenshots and flow explanation.
- Prepare database concept explanation.
- Add final report and presentation material.

## 17. Key Technical Risks

- Matching route schedule data to real track geometry can be messy.
- Public train schedule datasets may be incomplete or outdated.
- Full India OSM data can be large; use a regional subset first.
- Neo4j and PostgreSQL must stay synchronized.
- Database triggers should create events, but heavy route logic should remain in the backend.
- Real-time railway data may not be publicly available, so simulation is acceptable for MVP.

## 18. Recommended Architecture Decision

Use PostgreSQL/PostGIS as the main source of truth and Neo4j as a derived routing engine.

Reason:

- PostgreSQL is best for relational, temporal, distributed, and active database requirements.
- PostGIS handles spatial operations directly.
- Neo4j is excellent for alternate path search.
- Keeping Neo4j derived avoids data ownership conflicts.

Recommended final architecture:

```text
React Dashboard
  |
  | REST + Socket.IO
  v
Node.js / Express Backend
  |
  |---- PostgreSQL Main DB
  |       |-- PostGIS spatial tables
  |       |-- Temporal history tables
  |       |-- Active triggers and LISTEN/NOTIFY
  |       |-- FDW links to regional databases
  |
  |---- PostgreSQL Regional DBs
  |       |-- North
  |       |-- Central
  |       |-- South
  |
  |---- Neo4j Graph DB
          |-- station nodes
          |-- track edges
          |-- alternate route search
```

## 19. Suggested First Build Target

Build the smallest convincing version:

- 1 region.
- 25 stations.
- 10 trains.
- 1 failed track simulation.
- affected train detection.
- alternate route in Neo4j.
- map display and live update.

After that works, expand to distributed regional databases.
