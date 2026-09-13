# Phase 3 Schema Verification

Phase 3 implemented PostgreSQL/PostGIS schema migrations from the finalized database design documentation.

## Migration Files

- `database/migrations/001_extensions_and_schemas.sql`
- `database/migrations/002_enums.sql`
- `database/migrations/003_core_tables.sql`
- `database/migrations/004_indexes.sql`

## Migration Runner

- `scripts/run-migrations.mjs`
- npm command: `npm run migrate`

The runner:

- reads `backend/.env`.
- connects with `DATABASE_URL`.
- creates/uses `railway_main.schema_migrations`.
- applies pending `.sql` files in filename order.
- stores a SHA-256 checksum for each migration.
- refuses to continue if an already-applied migration file changes.

## Verification Runner

- `scripts/verify-schema.mjs`
- npm command: `npm run verify:schema`

## Latest Verification Result

The Supabase PostgreSQL database was reached successfully, and schema verification passed.

```text
PostGIS: available
Applied migrations: 4
Base tables: 15
Enums: 13
Spatial geography columns: 3
PK/FK/unique/check constraints: 182
```

Verified base tables:

- `affected_trains`
- `disruption_history`
- `disruptions`
- `event_log`
- `journey_delay_history`
- `regions`
- `route_recommendations`
- `schema_migrations`
- `stations`
- `track_status_history`
- `tracks`
- `train_journeys`
- `train_schedules`
- `train_status_history`
- `trains`

## Scope Boundary

This phase created schema objects only. It did not implement:

- seed data.
- views.
- SQL business functions.
- stored procedures.
- active triggers.
- backend APIs.
- frontend screens.

Those belong to later phases.

