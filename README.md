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

## Planned Stack

- Frontend: React, Vite, Tailwind CSS or CSS.
- Backend: Node.js, Express.js.
- Real-time updates: Socket.IO.
- Main database: PostgreSQL.
- Spatial database: PostgreSQL with PostGIS.
- Graph database: Neo4j.
- API style: REST APIs.

## Repository Structure

```text
backend/                    Application logic and API orchestration, added after database validation
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

Phase 0 is complete when the repository structure, documentation, `.env.example`, and `.gitignore` exist. No backend logic is implemented in this phase.

## Architecture Rule

This project follows database-first development. PostgreSQL is the source of truth, PostGIS handles spatial analysis, and Neo4j is a synchronized read-optimized routing projection. Backend and frontend work should start only after the database design, migrations, seed data, validation, triggers, PostGIS analysis, and Neo4j synchronization phases are complete.

## Infrastructure

Phase 1 uses managed cloud databases instead of Docker. Supabase is used for PostgreSQL/PostGIS, and Neo4j Aura is used for the graph database. See [docs/CLOUD_DATABASES.md](docs/CLOUD_DATABASES.md) for setup and verification commands.

No local database containers are required for this project.

## Database Migrations

Phase 3 migrations are applied to Supabase PostgreSQL using the root migration runner. The runner reads secrets from `backend/.env`.

```bash
npm install
npm run migrate
npm run verify:schema
```

## Seed Data

Phase 4 loads a repeatable Southern Railway demo dataset.

```bash
npm run seed
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

## Development Roadmap

See [docs/PHASED_BUILD_PLAN.md](docs/PHASED_BUILD_PLAN.md) for the phase-by-phase build plan.
