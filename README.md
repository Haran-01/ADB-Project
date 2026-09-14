# Intelligent Railway Network and Disruption Management System

This project is a simulation-backed railway disruption management system designed to demonstrate advanced database concepts through a practical railway operations dashboard.

## Project Goal

The system will monitor a railway network, detect or simulate disruptions, identify affected trains, search for alternate routes, validate route feasibility, and display the result to an operator in real time.

## Database Concepts Demonstrated

- Distributed Database: regional railway data stores such as North, Central, and South.
- Spatial Database: PostGIS station coordinates, track geometry, nearby station lookup, and map data.
- Graph Database: Neo4j station nodes and track edges for alternate route search.
- Temporal Database: schedules, journey status, delays, availability windows, and history tables.
- Active Database: PostgreSQL triggers and notifications for automatic disruption response.

## Stack

- Frontend: React, Vite, TanStack Query, React Router, Leaflet, Recharts, and CSS.
- Backend: Node.js, Express.js.
- Real-time updates: Socket.IO.
- Main database: PostgreSQL.
- Spatial database: PostgreSQL with PostGIS.
- Graph database: Neo4j.
- API style: REST APIs.

## Repository Structure

```text
backend/                    Express API, SQL/Neo4j analysis orchestration, Socket.IO worker
frontend/                   React operations dashboard and feature screens
database/
  migrations/               PostgreSQL/PostGIS schema migrations
  seeds/                    Realistic seed data
  triggers/                 Trigger SQL files
  procedures/               Stored procedure SQL files
  functions/                Stored function SQL files
  views/                    SQL views
  indexes/                  Index definitions and notes
  sample_queries/           Manual validation and demo SQL queries
  docs/                     ERD, relationship diagram, data dictionary, database reports
docs/                       Planning and architecture documents
scripts/                    Setup, validation, sync, and import scripts
```

## Current Phase

Phases 0–17 are complete. The project now includes the active database/outbox, PostGIS analysis, Neo4j routing projection, stable API and realtime worker, React operations dashboard, regional distribution demonstration, repeatable public-data importer, automated tests, final demo scenarios, documentation, and screenshots.

See [Phases 7–12 verification](docs/PHASES_7_12_VERIFICATION.md) and [Phases 13–17 verification](docs/PHASES_13_17_VERIFICATION.md). `docs/PHASED_BUILD_PLAN.md` is the authoritative numbering.

## Architecture Rule

This project follows database-first development. PostgreSQL is the source of truth, PostGIS handles spatial analysis, and Neo4j is a synchronized read-optimized routing projection. Backend and frontend work should start only after the database design, migrations, seed data, validation, triggers, PostGIS analysis, and Neo4j synchronization phases are complete.

## Infrastructure

Phase 1 uses managed cloud databases instead of Docker. Supabase is used for PostgreSQL/PostGIS, and Neo4j Aura is used for the graph database. See [docs/CLOUD_DATABASES.md](docs/CLOUD_DATABASES.md) for setup and verification commands.

No local database containers are required for this project.

## Database Migrations

Phase 3 migrations are applied to Supabase PostgreSQL using the root migration runner. The runner reads secrets from `backend/.env`.

```bash
npm ci
npm run migrate
npm run logic:apply
npm run verify:schema
```

## Seed Data

Phase 4 loads a repeatable Southern Railway demo dataset.

```bash
npm run seed -- --reset-demo
npm run verify:seed
```

## Database Validation

Validation is separated by intent. Live validation checks durable invariants without assuming untouched seed counts. Fixture validation checks exact counts in a freshly reset demo database. Scenario validation performs mutations inside a transaction that is always rolled back.

```bash
npm run validate:db
npm run validate:fixture
npm run validate:scenario
```

## SQL Business Logic

Phase 6 applies SQL-first views, functions, and procedures.

```bash
npm run logic:apply
npm run validate:db
```

## Implemented MVP

- Three logical regions with a cross-region journey.
- A deterministic 25-station fallback seed plus attributed public-data augmentation.
- 64 directed track relationships and 13 active demo journeys in the current cloud dataset.
- Track failure, station closure, and maintenance scenarios.
- End-to-end flow from disruption to affected journey, validated alternate route, live UI, and guarded application.

## Run the backend

1. Copy `.env.example` to `backend/.env` and fill in your own connection values. Process environment variables override this file.
2. Use a direct or **session-pooled** PostgreSQL connection for migrations and `DATABASE_LISTEN_URL`. Supabase direct hosts may require IPv6; session poolers support IPv4. Transaction poolers do not support persistent `LISTEN` sessions.
3. Run the migration and logic commands above. Seeding **deletes the railway demo dataset**, so only use `--reset-demo` on a dedicated demo database.
4. Run `npm run graph:sync`, then `npm start`.
5. In a second terminal run `npm --prefix frontend ci` and `npm run frontend:dev`.
6. Open `http://localhost:5173`; health endpoints are under `http://127.0.0.1:4000/api/health`.

The backend defaults to loopback only. Configure `API_TOKEN` for shared access; production and non-loopback binding require it. Clients send `Authorization: Bearer <token>` and Socket.IO `auth: { token }`. Use a restricted login with membership in `railway_app` for runtime, and the schema owner for migrations.

TLS certificates are verified by default. Configure `DATABASE_CA_FILE` for a private CA. Local isolated PostgreSQL can explicitly use `DATABASE_SSL_MODE=disable`; insecure remote TLS requires both `DATABASE_SSL_MODE=require` and `ALLOW_INSECURE_DB_TLS=true`.

## Tests and validation

```bash
npm test                         # isolated PostgreSQL/PostGIS, API and Socket.IO tests
npm run test:cloud               # temporary isolated Aura projection, cleaned up afterward
npm run graph:verify             # sync real PostgreSQL source, verify demo alternate routes
npm run validate:db              # rollback-only checks; no report file changes
npm run validate:fixture         # exact checks for a freshly reset demo fixture
npm run validate:scenario        # mutation checks inside an always-rolled-back transaction
npm run validate:db -- --report  # explicitly regenerate the validation report
npm run frontend:test            # React state/API tests
npm run frontend:build           # production frontend build
```

Tests use PGlite's PostgreSQL engine and experimental PostGIS extension as an isolated fixture; they do not truncate Supabase. The opt-in cloud test adds real Aura graph queries. Exact seed expectations are limited to fixture validation, so ordinary `validate:db` remains suitable for an evolving operational database.

See the [setup guide](docs/SETUP.md), [architecture](docs/ARCHITECTURE.md), [concept mapping](docs/CONCEPT_MAPPING.md), [demo workflow](docs/DEMO_WORKFLOW.md), [API reference](docs/API.md), and [worker behavior](docs/REALTIME.md).

## Development Roadmap

See [docs/PHASED_BUILD_PLAN.md](docs/PHASED_BUILD_PLAN.md) for the phase-by-phase build plan.
