# Phase 6 SQL Logic Verification

Phase 6 implemented SQL-first business logic directly in PostgreSQL/Supabase before backend APIs.

## Applied Artifacts

### Views

- `database/views/001_reporting_views.sql`

Created views:

- `railway_main.v_track_network`
- `railway_main.v_train_schedule_ordered`
- `railway_main.v_active_train_journeys`
- `railway_main.v_active_disruptions`
- `railway_main.v_disruption_impact_summary`

### Functions

- `database/functions/001_analysis_functions.sql`

Created functions:

- `railway_main.fn_get_train_schedule(uuid)`
- `railway_main.fn_get_train_schedule(text)`
- `railway_main.fn_get_active_track_availability(uuid, timestamptz)`
- `railway_main.fn_find_nearby_stations(geography, numeric)`
- `railway_main.fn_estimate_delay_minutes(numeric, integer, disruption_severity)`
- `railway_main.fn_get_disruption_context(uuid)`
- `railway_main.fn_find_trains_using_track(uuid, date)`

### Procedures

- `database/procedures/001_analysis_procedures.sql`

Created procedures:

- `railway_main.sp_record_affected_train(...)`
- `railway_main.sp_store_route_recommendation(...)`
- `railway_main.sp_mark_disruption_analyzed(...)`
- `railway_main.sp_apply_route_recommendation(...)`

## Runner

- `scripts/apply-db-logic.mjs`
- npm command: `npm run logic:apply`

The runner:

- reads `backend/.env`.
- connects with `DATABASE_URL`.
- applies SQL files from:
  - `database/views`
  - `database/functions`
  - `database/procedures`

## Validation

Validation was added to:

- `database/sample_queries/phase6_logic_validation.sql`
- `database/sample_queries/validation.sql`
- `scripts/run-validation.mjs`

Command:

```bash
npm run validate:db
```

Latest validation result:

```text
Total checks: 31
Passed: 31
Failed: 0
```

Phase 6 specific checks passed for:

- expected views present.
- reporting views returning seeded rows.
- train schedule lookup function.
- track availability function.
- nearby stations PostGIS function.
- delay estimation function.
- disruption context function.
- affected train detection function.
- affected train procedure upsert behavior.

## Scope Boundary

This phase implemented SQL business logic only.

It did not implement:

- active database triggers.
- PostgreSQL `NOTIFY`.
- Neo4j synchronization.
- backend APIs.
- frontend screens.

Those belong to later phases.

