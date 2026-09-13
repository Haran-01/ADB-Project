# Phase-by-Phase Build Plan

Project: Intelligent Railway Network and Disruption Management System

This roadmap follows a database-first architecture. The database must be designed, implemented, seeded, validated, and proven before backend APIs or frontend screens are built.

## Mandatory Architecture Rules

### Database-First Rule

Every feature must follow this workflow:

1. Design the database.
2. Create migrations.
3. Seed realistic data.
4. Verify SQL manually.
5. Test triggers.
6. Test PostGIS.
7. Synchronize Neo4j from PostgreSQL.
8. Expose APIs.
9. Build frontend screens.

Do not skip directly to backend or frontend implementation.

### PostgreSQL Source of Truth

PostgreSQL is the authoritative database.

Neo4j is a read-optimized routing engine only. Do not insert, update, or delete railway business data directly in Neo4j. Every Neo4j node and relationship must originate from PostgreSQL through synchronization scripts.

### Three Logical Layers

The project is divided into three independent layers:

1. Database Layer
   - PostgreSQL
   - PostGIS
   - Neo4j
   - triggers
   - stored functions/procedures
   - views
   - indexes
   - history tables

2. Analysis Layer
   - affected train detection
   - spatial analysis
   - graph routing
   - temporal validation
   - route recommendation engine

3. Presentation Layer
   - REST APIs
   - Socket.IO
   - React dashboard

Presentation code must not contain business logic. Business logic belongs in SQL/database objects where practical, and in the analysis layer when orchestration or graph synchronization is needed.

### SQL-First Business Logic

Implement business logic inside PostgreSQL whenever practical before implementing orchestration in Node.js.

Examples:

- affected train detection.
- delay calculations.
- schedule lookups.
- route availability checks.
- aggregation queries.
- reporting queries.
- history queries.

The backend should primarily orchestrate database operations instead of reimplementing SQL logic.

### Phase Completion Rule

A phase is complete only when:

- all deliverables are implemented.
- SQL has been tested where applicable.
- APIs have been verified where applicable.
- database objects have been validated.
- documentation has been updated.
- changes have been committed to version control, if the repository is initialized with git.

Do not proceed to the next phase until the current phase is complete.

## Required Project Structure

```text
backend/                    Application logic and API orchestration only
frontend/                   React dashboard
database/
  migrations/               Schema migrations
  seeds/                    Realistic seed data
  triggers/                 Trigger SQL files
  procedures/               Stored procedure SQL files
  functions/                Stored function SQL files
  views/                    SQL views
  indexes/                  Index definitions and index notes
  sample_queries/           Manual validation and demo SQL queries
  docs/                     ERD, relationship diagram, data dictionary
docs/                       Project planning and architecture documents
scripts/                    Setup, validation, sync, and import scripts
```

## Recommended Build Strategy

Build a simulation-backed MVP first. Do not start with the full Indian railway network. Start with a small, internally consistent railway network and prove the complete disruption workflow from database to dashboard.

Initial target:

- 1 region.
- 25-50 stations.
- 40-80 tracks.
- 10-20 trains.
- 1-3 disruption scenarios.
- PostgreSQL/PostGIS as the source of truth.
- Neo4j as a synchronized routing projection.
- React dashboard after database and backend behavior are stable.

## Phase 0 - Repository Setup and Architecture Alignment

### Goal

Prepare the workspace and align the repository with the database-first architecture.

### Tasks

- Create or verify root `README.md`.
- Create or verify `.env.example`.
- Create or verify `.gitignore`.
- Create required folders:
  - `backend`
  - `frontend`
  - `database`
  - `database/migrations`
  - `database/seeds`
  - `database/triggers`
  - `database/procedures`
  - `database/functions`
  - `database/views`
  - `database/indexes`
  - `database/sample_queries`
  - `database/docs`
  - `docs`
  - `scripts`
- Document that backend and frontend implementation must wait until database foundation phases are complete.

### Deliverables

- Clean project structure.
- Basic documentation.
- Environment variable template.
- Database artifact folders.

### Done When

- The repo has the required folders.
- Future phases know where every database artifact belongs.
- No backend logic has been implemented yet.

### Prompt For Next Chat

```text
Start Phase 1. Configure managed cloud database infrastructure using Supabase for PostgreSQL/PostGIS and Neo4j Aura for the graph database. Create cloud database documentation and update environment templates. Do not use Docker and do not build backend APIs yet.
```

## Phase 1 - Infrastructure Foundation

### Goal

Set up managed cloud database infrastructure before any application code is written.

### Tasks

- Use Supabase for PostgreSQL/PostGIS.
- Use Neo4j Aura for Neo4j.
- Do not use Docker containers for project databases.
- Configure PostgreSQL schemas:
  - `railway_main`
  - later: `railway_north`
  - later: `railway_central`
  - later: `railway_south`
- Update `.env.example` if needed.
- Add infrastructure notes to `README.md`.
- Document Supabase setup.
- Document PostGIS enablement.
- Document Neo4j Aura setup.
- Document cloud verification commands.

### Deliverables

- managed Supabase PostgreSQL/PostGIS plan.
- managed Neo4j Aura plan.
- cloud database setup documentation.
- updated environment template.

### Done When

- Supabase project details are documented.
- PostGIS enablement SQL is documented.
- Neo4j Aura connection details are documented.
- No backend APIs have been created.

### Prompt For Next Chat

```text
Start Phase 1. Configure managed cloud database infrastructure using Supabase for PostgreSQL/PostGIS and Neo4j Aura for the graph database. Create cloud database documentation and update environment templates. Do not use Docker and do not build backend APIs yet.
```

## Phase 2 - Complete Database Design Documentation

### Goal

Design the database completely before writing migration SQL.

### Tasks

- Create database documentation in `database/docs`.
- Produce ER diagram.
- Produce relationship diagram.
- Write data dictionary.
- Write entity descriptions.
- Define primary keys.
- Define foreign keys.
- Define constraints.
- Define enum values.
- Explain normalization to at least 3NF.
- Define index strategy.
- Define history table strategy.
- Define which logic belongs in SQL functions, procedures, views, and triggers.
- Define how PostgreSQL will synchronize to Neo4j.

### Required Entities

- `regions`
- `stations`
- `tracks`
- `trains`
- `train_schedules`
- `train_journeys`
- `disruptions`
- `affected_trains`
- `route_recommendations`
- `event_log`
- `track_status_history`
- `train_status_history`
- `journey_delay_history`
- `disruption_history`

### Deliverables

- `database/docs/ER_DIAGRAM.md`
- `database/docs/RELATIONSHIP_DIAGRAM.md`
- `database/docs/DATA_DICTIONARY.md`
- `database/docs/NORMALIZATION.md`
- `database/docs/INDEX_STRATEGY.md`
- `database/docs/DATABASE_LOGIC_PLAN.md`

### Done When

- The schema is fully specified in documentation.
- Relationships and constraints are clear.
- No migration SQL has been written before this documentation is complete.

### Prompt For Next Chat

```text
Start Phase 2. Create complete database design documentation before writing SQL: ER diagram, relationship diagram, data dictionary, entity descriptions, PKs, FKs, constraints, 3NF normalization explanation, index strategy, and database logic plan. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 3 - PostgreSQL and PostGIS Schema Migrations

### Goal

Implement the documented relational, spatial, temporal, and event schema in PostgreSQL.

### Tasks

- Create migration files in `database/migrations`.
- Enable PostGIS.
- Create enum types.
- Create all documented tables.
- Add primary keys.
- Add foreign keys.
- Add check constraints.
- Add unique constraints.
- Add temporal/history tables.
- Add spatial columns.
- Add migration runner script.
- Keep triggers, views, stored functions, and heavy business queries in later dedicated phases unless required for table creation.

### Deliverables

- SQL migrations.
- Migration runner.
- PostgreSQL schema matching `database/docs`.

### Done When

- A fresh database can be migrated from zero.
- Tables match the data dictionary.
- Keys and constraints are visible in PostgreSQL.
- PostGIS geometry/geography columns exist.

### Prompt For Next Chat

```text
Start Phase 3. Implement PostgreSQL/PostGIS schema migrations from the finalized database documentation. Create tables, enums, PKs, FKs, constraints, history tables, spatial columns, and a migration runner. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 4 - Realistic Seed Data

### Goal

Populate all tables with realistic sample data before backend implementation.

### Tasks

- Create seed SQL or seed scripts in `database/seeds`.
- Seed:
  - 1 region.
  - 25-50 stations.
  - 40-80 tracks.
  - 10-20 trains.
  - train schedules.
  - active train journeys.
  - sample disruptions.
  - initial history rows where appropriate.
- Create track geometries from station coordinates when real geometry is unavailable.
- Keep data internally consistent.
- Document sample data assumptions.

### Deliverables

- Repeatable seed files.
- Seed runner script.
- Seed data notes.

### Done When

- All core tables have realistic sample rows.
- Foreign key references are valid.
- Demo journeys and routes can be queried manually.

### Prompt For Next Chat

```text
Start Phase 4. Create realistic seed data for the PostgreSQL/PostGIS schema, including stations, tracks, trains, schedules, journeys, disruptions, and history rows. Add a repeatable seed runner. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 5 - Dedicated Database Validation

### Goal

Prove the database alone can solve the core business problems before any backend APIs are written.

### Tasks

- Create manual validation SQL files in `database/sample_queries`.
- Verify every foreign key.
- Verify constraints.
- Verify indexes.
- Test joins across all major entities.
- Test views if any exist.
- Test stored functions and procedures if any exist.
- Test trigger execution if any exists at this stage.
- Verify history tables.
- Verify PostGIS queries.
- Execute important business queries manually:
  - active train journeys.
  - train schedule lookup.
  - track availability lookup.
  - trains using a failed track.
  - nearest stations to a disruption.
  - unresolved disruptions.
  - route recommendation history.
- Record expected query results.

### Deliverables

- `database/sample_queries/validation.sql`
- `database/sample_queries/business_queries.sql`
- `database/docs/DATABASE_VALIDATION_REPORT.md`

### Done When

- SQL validation has been run successfully.
- Important joins and constraints are proven.
- PostGIS sample queries return expected results.
- The validation report documents what was tested.

### Prompt For Next Chat

```text
Start Phase 5. Create and run dedicated database validation SQL: foreign key checks, constraints, joins, indexes, history tables, PostGIS queries, and core business queries. Document results in database/docs/DATABASE_VALIDATION_REPORT.md. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 6 - SQL Business Logic: Views, Functions, and Procedures

### Goal

Implement database-side business logic before Node.js orchestration.

### Tasks

- Create SQL views in `database/views`.
- Create SQL functions in `database/functions`.
- Create procedures in `database/procedures` where useful.
- Implement SQL-first logic for:
  - affected train detection.
  - schedule lookup.
  - delay calculation.
  - route availability checks.
  - disruption impact summaries.
  - reporting queries.
- Add SQL tests or validation queries for each object.
- Update documentation with function/view behavior.

### Deliverables

- SQL views.
- SQL functions.
- SQL procedures where needed.
- Validation queries.
- Documentation updates.

### Done When

- Business queries work directly in PostgreSQL.
- Each function/view has a documented purpose.
- Database logic has been manually verified.

### Prompt For Next Chat

```text
Start Phase 6. Implement SQL-first business logic using PostgreSQL views, functions, and procedures for affected train detection, schedule lookups, delay calculations, route availability, and reporting. Add validation queries and documentation. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 7 - Active Database Triggers

### Goal

Implement automatic database reactions to important railway events.

### Tasks

- Create trigger SQL in `database/triggers`.
- Add trigger for track status changes:
  - when `tracks.status` changes from `ACTIVE` to `FAILED`, insert a disruption.
- Add trigger for disruption creation:
  - insert event into `event_log`.
- Add trigger for relevant history table updates.
- Add PostgreSQL `NOTIFY` events for backend workers to consume later.
- Add validation SQL for trigger behavior.
- Document trigger rules.

### Deliverables

- Trigger SQL files.
- Trigger validation queries.
- Trigger documentation.

### Done When

- Updating a track to `FAILED` automatically creates a disruption.
- Event log rows are created.
- History rows are created where appropriate.
- Trigger behavior is proven by SQL before backend code exists.

### Prompt For Next Chat

```text
Start Phase 7. Implement active database triggers for track failure, disruption event logging, history updates, and PostgreSQL NOTIFY. Add validation SQL and documentation. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 8 - Dedicated PostGIS Analysis

### Goal

Prove all spatial functionality directly in PostgreSQL/PostGIS.

### Tasks

- Create PostGIS analysis queries in `database/sample_queries/postgis_analysis.sql`.
- Implement or validate:
  - station point geometry.
  - track line geometry.
  - nearby station lookup with `ST_DWithin`.
  - distance ranking with `ST_Distance`.
  - affected track lookup with `ST_Intersects`.
  - GeoJSON output for map rendering.
- Add spatial indexes in `database/indexes` if not already created.
- Document spatial assumptions and units.

### Deliverables

- PostGIS sample query file.
- Spatial index SQL or index documentation.
- Spatial validation report section.

### Done When

- Nearby station and affected track queries work.
- GeoJSON can be generated from SQL.
- Spatial indexes are present and documented.

### Prompt For Next Chat

```text
Start Phase 8. Implement and validate dedicated PostGIS analysis queries for station geometry, track geometry, nearby stations, affected tracks, distance ranking, spatial indexes, and GeoJSON output. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 9 - Neo4j Synchronization and Routing Projection

### Goal

Synchronize graph data from PostgreSQL into Neo4j and prove routing behavior.

### Tasks

- Create sync script in `scripts`.
- Read stations and tracks from PostgreSQL.
- Write station nodes to Neo4j.
- Write track relationships to Neo4j.
- Do not create graph data that does not exist in PostgreSQL.
- Store relationship properties:
  - `trackId`
  - `distanceKm`
  - `speedLimitKmph`
  - `travelMinutes`
  - `status`
  - `region`
- Create routing test queries.
- Validate alternate route search that excludes failed/blocked/maintenance tracks.
- Document synchronization rules.

### Deliverables

- PostgreSQL-to-Neo4j sync script.
- Neo4j routing validation queries.
- Neo4j sync documentation.

### Done When

- Neo4j graph can be fully rebuilt from PostgreSQL.
- No railway business data is manually inserted into Neo4j.
- Alternate routes can be tested in Neo4j.

### Prompt For Next Chat

```text
Start Phase 9. Implement PostgreSQL-to-Neo4j synchronization and routing projection. Neo4j must be read-optimized only and fully rebuilt from PostgreSQL data. Add route validation queries. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 10 - Backend API Foundation

### Goal

Create the backend only after the database foundation is mature and validated.

### Tasks

- Initialize backend Node.js project.
- Install backend dependencies:
  - `express`
  - `cors`
  - `dotenv`
  - `pg`
  - `neo4j-driver`
  - `socket.io`
  - `zod`
  - `morgan`
  - dev dependency: `nodemon`
- Create backend structure:
  - `src/app.js`
  - `src/server.js`
  - `src/config/env.js`
  - `src/db/postgres.js`
  - `src/db/neo4j.js`
  - `src/routes/index.js`
  - `src/modules/health/health.routes.js`
- Add health APIs:
  - `GET /api/health`
  - `GET /api/health/db`
  - `GET /api/health/neo4j`
- Backend must call existing database logic rather than duplicating it.

### Deliverables

- Running Express backend.
- Health endpoints.
- PostgreSQL and Neo4j client modules.

### Done When

- Backend starts.
- Health endpoints work.
- Database connectivity is verified through APIs.

### Prompt For Next Chat

```text
Start Phase 10. Create the Express backend foundation only after the validated database phases. Add PostgreSQL and Neo4j clients and health routes. Do not duplicate business logic already implemented in SQL. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 11 - Backend APIs for Database and Analysis Layer

### Goal

Expose mature database behavior through REST APIs.

### Tasks

- Create modules:
  - `stations`
  - `tracks`
  - `trains`
  - `journeys`
  - `network`
  - `disruptions`
  - `analysis`
  - `routing`
- Implement APIs:
  - `GET /api/stations`
  - `GET /api/tracks`
  - `GET /api/network/map`
  - `GET /api/trains`
  - `GET /api/journeys/active`
  - `GET /api/disruptions`
  - `POST /api/disruptions`
  - `GET /api/disruptions/:id/affected-trains`
  - `GET /api/disruptions/:id/recommendations`
  - `POST /api/disruptions/:id/analyze`
  - `POST /api/recommendations/:id/apply`
- Use database views/functions for business logic where available.
- Validate requests with Zod.
- Return map data as GeoJSON where useful.

### Deliverables

- REST APIs.
- API validation.
- API documentation notes.

### Done When

- APIs expose validated SQL/database behavior.
- Creating and analyzing disruptions through APIs works.
- API responses match frontend needs.

### Prompt For Next Chat

```text
Start Phase 11. Build REST APIs that expose the validated PostgreSQL/PostGIS and Neo4j analysis behavior. Use database views/functions where available and keep business logic out of presentation code. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 12 - Realtime Event Worker

### Goal

Connect PostgreSQL active database events to backend realtime updates.

### Tasks

- Add backend worker using PostgreSQL `LISTEN`.
- Listen for disruption-related `NOTIFY` events.
- Mark disruption analysis states where appropriate.
- Orchestrate calls to database analysis functions and Neo4j routing.
- Emit Socket.IO events:
  - `disruption.created`
  - `disruption.analysis_started`
  - `disruption.analysis_completed`
  - `train.affected`
  - `route.recommended`
  - `train.status_updated`

### Deliverables

- Event worker.
- Socket.IO server setup.
- Realtime event documentation.

### Done When

- Updating a track in PostgreSQL can trigger backend realtime notifications.
- Socket.IO clients can receive event updates.

### Prompt For Next Chat

```text
Start Phase 12. Implement the backend realtime event worker using PostgreSQL LISTEN/NOTIFY and Socket.IO. The worker should orchestrate validated database analysis and Neo4j routing. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 13 - Frontend Foundation

### Goal

Create the React frontend only after API behavior is stable.

### Tasks

- Initialize React with Vite.
- Install frontend dependencies:
  - `@tanstack/react-query`
  - `react-router-dom`
  - `socket.io-client`
  - `lucide-react`
  - map library: `leaflet` or `maplibre-gl`
  - chart library: `recharts`
- Set up app layout:
  - top bar.
  - left navigation.
  - main dashboard area.
- Add API client.
- Add Socket.IO client.
- Add pages:
  - Operations Dashboard.
  - Disruptions.
  - Trains.
  - History.

### Deliverables

- Running React frontend.
- API client connected to backend.
- Dashboard shell.

### Done When

- Frontend starts.
- It can call `/api/health`.
- It is ready for feature screens.

### Prompt For Next Chat

```text
Start Phase 13. Create the React Vite frontend foundation with routing, API client, Socket.IO client, dashboard shell, navigation, and base pages. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 14 - Frontend Operations Dashboard

### Goal

Build the operator dashboard on top of stable backend APIs.

### Tasks

- Build map view with stations and tracks.
- Show active disruptions.
- Show active train journeys.
- Add disruption simulator panel:
  - select track.
  - choose disruption type.
  - choose severity.
  - submit.
- Add affected trains table.
- Add route recommendation panel.
- Add event timeline.
- Update UI live from Socket.IO events.
- Do not place business logic in frontend components.

### Deliverables

- Usable operations dashboard.
- Map-based monitoring.
- Disruption simulation from UI.
- Live affected train and recommendation display.

### Done When

- User can trigger a track failure from the UI.
- Map updates disruption status.
- Affected trains and route recommendations appear.

### Prompt For Next Chat

```text
Start Phase 14. Build the React operations dashboard using the existing APIs and realtime events. Include map, disruption simulator, affected trains table, route recommendation panel, and event timeline. Keep business logic out of frontend code. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 15 - Distributed Database Demonstration

### Goal

Add the advanced distributed database concept in a demonstrable way after the single-region MVP works.

### Tasks

- Create regional schemas or databases:
  - `railway_north`
  - `railway_central`
  - `railway_south`
- Move or copy region-specific data into regional stores.
- Configure `postgres_fdw` from `railway_main`.
- Create foreign tables or views.
- Add cross-region validation queries.
- Create one cross-region train journey.
- Simulate a disruption that affects a train crossing regions.
- Document distributed database behavior.

### Deliverables

- Distributed database setup.
- FDW or regional schema queries.
- Cross-region disruption demo.

### Done When

- Main database can read regional data through FDW or equivalent views.
- Cross-region disruption behavior is demonstrable.
- Documentation explains the distributed database concept clearly.

### Prompt For Next Chat

```text
Start Phase 15. Add the distributed database demonstration using regional PostgreSQL schemas or databases, FDW/views, and a cross-region disruption scenario. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 16 - Public Dataset Import Upgrade

### Goal

Replace or augment handcrafted demo data with public datasets.

### Tasks

- Choose dataset source:
  - India Geodata for stations/tracks.
  - Kaggle Indian Railways for trains/schedules.
  - OSM/Geofabrik for richer track geometry.
- Write import scripts.
- Normalize station codes.
- Map trains to station records.
- Create graph edges from imported route order.
- Preserve handcrafted demo seed data as fallback.
- Re-run database validation after import.
- Rebuild Neo4j from PostgreSQL.

### Deliverables

- Dataset import scripts.
- Larger seed dataset.
- Dataset documentation.
- Validation report update.

### Done When

- Public data can be imported repeatably.
- PostgreSQL remains the source of truth.
- Neo4j can be rebuilt from imported PostgreSQL data.
- End-to-end disruption workflow still works.

### Prompt For Next Chat

```text
Start Phase 16. Add dataset import scripts for public railway station, track, train, and schedule data, while preserving the existing demo seed workflow. Re-run validation and rebuild Neo4j from PostgreSQL. Follow docs/PHASED_BUILD_PLAN.md.
```

## Phase 17 - Testing, Polish, and Final Demo

### Goal

Make the project reliable and presentation-ready.

### Tasks

- Add backend tests for APIs and orchestration.
- Add SQL validation tests where practical.
- Add seed validation checks.
- Add frontend loading, error, and empty states.
- Add demo scenarios:
  - track failure.
  - station closure.
  - maintenance blockage.
- Add final documentation:
  - setup guide.
  - database concept mapping.
  - system architecture.
  - demo workflow.
- Capture screenshots for report/presentation.

### Deliverables

- Working final project.
- Test coverage for important logic.
- Presentation-ready documentation.

### Done When

- A fresh setup can run the complete demo.
- Each advanced database concept is visible and explainable.
- UI shows a complete disruption-to-reroute workflow.

### Prompt For Next Chat

```text
Start Phase 17. Add tests, demo scenarios, final documentation, and polish for the railway disruption management project. Follow docs/PHASED_BUILD_PLAN.md.
```

## Best Phase Order

Follow this order:

1. Phase 0 - repository setup and architecture alignment.
2. Phase 1 - infrastructure foundation.
3. Phase 2 - complete database design documentation.
4. Phase 3 - PostgreSQL and PostGIS schema migrations.
5. Phase 4 - realistic seed data.
6. Phase 5 - dedicated database validation.
7. Phase 6 - SQL business logic: views, functions, and procedures.
8. Phase 7 - active database triggers.
9. Phase 8 - dedicated PostGIS analysis.
10. Phase 9 - Neo4j synchronization and routing projection.
11. Phase 10 - backend API foundation.
12. Phase 11 - backend APIs for database and analysis layer.
13. Phase 12 - realtime event worker.
14. Phase 13 - frontend foundation.
15. Phase 14 - frontend operations dashboard.
16. Phase 15 - distributed database demonstration.
17. Phase 16 - public dataset import upgrade.
18. Phase 17 - testing, polish, and final demo.

## MVP Completion Definition

The MVP is complete when this full flow works:

1. A user marks a track as failed.
2. PostgreSQL trigger creates a disruption event.
3. PostgreSQL stores the event and history records.
4. SQL functions/views identify affected trains.
5. PostGIS finds nearby useful stations and affected tracks.
6. Neo4j, synchronized from PostgreSQL, finds an alternate path.
7. Temporal checks verify route feasibility.
8. Recommendation is stored in PostgreSQL.
9. Backend APIs expose the result.
10. Socket.IO publishes realtime updates.
11. Frontend displays affected train, original route, alternate route, and expected delay.
