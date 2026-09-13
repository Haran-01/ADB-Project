# Phase 4 Seed Verification

Phase 4 created and loaded repeatable demo seed data for the PostgreSQL/PostGIS schema.

## Seed Files

- `database/seeds/001_demo_southern_network.sql`
- `database/seeds/README.md`

## Seed Runner

- `scripts/run-seeds.mjs`
- npm command: `npm run seed`

The runner:

- reads `backend/.env`.
- connects with `DATABASE_URL`.
- runs seed SQL files from `database/seeds` in filename order.

## Verification Runner

- `scripts/verify-seed.mjs`
- npm command: `npm run verify:seed`

## Demo Dataset

The seed creates a Southern Railway simulation dataset:

- 1 region.
- 25 stations.
- 60 directed tracks.
- 12 trains.
- 80 schedule rows.
- 12 active train journeys.
- 3 disruptions.
- 4 affected train rows.
- 2 route recommendation rows.
- 3 event log rows.
- initial history rows.

## Latest Verification Result

The seed was applied to Supabase successfully, then rerun to prove repeatability. Verification passed.

```text
regions: 1 expected=1 OK
stations: 25 expected=25 OK
tracks: 60 expected=60 OK
trains: 12 expected=12 OK
train_schedules: 80 expected=80 OK
train_journeys: 12 expected=12 OK
disruptions: 3 expected=3 OK
affected_trains: 4 expected=4 OK
route_recommendations: 2 expected=2 OK
event_log: 3 expected=3 OK
track_status_history: 60 expected=60 OK
train_status_history: 12 expected=12 OK
journey_delay_history: 5 expected=5 OK
disruption_history: 3 expected=3 OK
foreign key spot-check violations: 0
station geometries: 25
track geometries: 60
```

## Scope Boundary

This phase added seed data only. It did not implement:

- dedicated validation query files.
- SQL views.
- SQL business functions.
- stored procedures.
- active triggers.
- backend APIs.
- frontend screens.

Those belong to later phases.

