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

- Frontend (Phase 13 onward): React, Vite, Tailwind CSS or CSS.
- Backend: Node.js, Express.js.
- Real-time updates: Socket.IO.
- Main database: PostgreSQL.
- Spatial database: PostgreSQL with PostGIS.
- Graph database: Neo4j.
- API style: REST APIs.

## Repository Structure

```text
backend/                    Express API, SQL/Neo4j analysis orchestration, Socket.IO worker
frontend/                   React dashboard, added after APIs are stable
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

Phases 0–6 were implemented previously. This revision implements the requested corrections and Phases 7–12: active triggers/outbox, PostGIS analysis, Neo4j projection, Express APIs, analysis orchestration, and a realtime worker. Frontend Phases 13–14 have not started.

See [phase verification](docs/PHASES_7_12_VERIFICATION.md) for executed checks and the distinction between isolated tests, Aura verification, and Supabase deployment. `docs/PHASED_BUILD_PLAN.md` is the authoritative phase numbering.

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

Phase 5 runs dedicated SQL validation checks and generates a report.

```bash
npm run validate:db
```

## SQL Business Logic

Phase 6 applies SQL-first views, functions, and procedures.

```bash
npm run logic:apply
npm run validate:db
```

## First MVP Target

- 1 railway region.
- 25-50 stations.
- 40-80 tracks.
- 10-20 trains.
- 1-3 disruption scenarios.
- End-to-end flow from track failure to alternate route recommendation.

## Run the backend

1. Copy `.env.example` to `backend/.env` and fill in your own connection values. Process environment variables override this file.
2. Use a direct or **session-pooled** PostgreSQL connection for migrations and `DATABASE_LISTEN_URL`. Supabase direct hosts may require IPv6; session poolers support IPv4. Transaction poolers do not support persistent `LISTEN` sessions.
3. Run the migration and logic commands above. Seeding **deletes the railway demo dataset**, so only use `--reset-demo` on a dedicated demo database.
4. Run `npm run graph:sync`, then `npm start`.
5. Visit `/api/health`, `/api/health/db`, and `/api/health/neo4j` on `http://127.0.0.1:4000`.

The backend defaults to loopback only. Configure `API_TOKEN` for shared access; production and non-loopback binding require it. Clients send `Authorization: Bearer <token>` and Socket.IO `auth: { token }`. Use a restricted login with membership in `railway_app` for runtime, and the schema owner for migrations.

TLS certificates are verified by default. Configure `DATABASE_CA_FILE` for a private CA. Local isolated PostgreSQL can explicitly use `DATABASE_SSL_MODE=disable`; insecure remote TLS requires both `DATABASE_SSL_MODE=require` and `ALLOW_INSECURE_DB_TLS=true`.

## Tests and validation

```bash
npm test                         # isolated PostgreSQL/PostGIS, API and Socket.IO tests
npm run test:cloud               # temporary isolated Aura projection, cleaned up afterward
npm run graph:verify             # sync real PostgreSQL source, verify demo alternate routes
npm run validate:db              # rollback-only checks; no report file changes
npm run validate:db -- --report  # explicitly regenerate the validation report
```

Tests use PGlite's PostgreSQL engine and experimental PostGIS extension as an isolated fixture; they do not truncate Supabase. The cloud test adds real Aura graph queries. Database validation includes seed-specific expectations and should run against a fresh demo dataset; it is not an operational health check.

See [API reference](docs/API.md), [worker behavior](docs/REALTIME.md), and [database/spatial/graph design](database/docs/PHASES_7_9_DESIGN.md).

## Development Roadmap

See [docs/PHASED_BUILD_PLAN.md](docs/PHASED_BUILD_PLAN.md) for the phase-by-phase build plan.
