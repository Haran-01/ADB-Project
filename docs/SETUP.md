# Complete setup guide

This project uses Supabase PostgreSQL/PostGIS and Neo4j Aura; no local database containers are required. PostgreSQL is authoritative and Neo4j is rebuilt from it.

## Prerequisites

- Node.js 24 or newer and npm
- a Supabase project with PostGIS available
- a Neo4j Aura instance
- a direct or session-pooled PostgreSQL URL for migrations and `LISTEN/NOTIFY`

## Configure

```bash
cp .env.example backend/.env
npm ci
npm --prefix frontend ci
```

Fill `backend/.env` locally. Do not commit it. `DATABASE_URL` and `DATABASE_LISTEN_URL` must use a direct or session-pooled connection; a transaction pooler cannot hold a `LISTEN` session. Use the schema owner only for setup. For the running API, use a separate login granted membership in `railway_app`.

For shared or non-loopback access, set `API_TOKEN`. The frontend accepts `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, and `VITE_API_TOKEN` in `frontend/.env.local`. The defaults are `http://127.0.0.1:4000/api` and `http://127.0.0.1:4000`.

## Build the data layer

```bash
npm run migrate
npm run logic:apply
npm run verify:schema
npm run seed -- --reset-demo
npm run verify:seed
npm run validate:fixture
npm run graph:sync
npm run graph:verify
```

`--reset-demo` deletes and recreates demo rows. Use it only in a dedicated demo database. Routine validation on an operational database is read-only and rollback-only:

```bash
npm run validate:db
```

## Optional Phase 15 and 16 data

```bash
npm run demo:distributed
npm run validate:scenario
node scripts/download-osm-stations.mjs --bbox=12.5,79.8,13.3,80.3 --region=SR
node scripts/import-public-data.mjs --file data/raw/osm-stations.json --apply
npm run graph:sync
```

The regional scenario and importer are idempotent. Public records retain source/license metadata; handcrafted station rows are not overwritten by a different source.

## Run

Use two terminals:

```bash
npm start
npm run frontend:dev
```

Open `http://localhost:5173`. Check `http://127.0.0.1:4000/api/health`, `/api/health/db`, and `/api/health/neo4j` if the status indicator is unavailable.

## Verify a fresh setup

```bash
npm test
npm run frontend:test
npm run frontend:build
npm run validate:db
npm run graph:verify
```

`npm test` uses isolated PGlite/PostGIS fixtures and never resets Supabase. `npm run test:cloud` is opt-in because it creates and cleans a temporary Aura projection.

