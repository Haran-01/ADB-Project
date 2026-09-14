# Seed Data

Run `npm run seed -- --reset-demo` only on a dedicated demo database: it truncates railway data. It is atomic and works before or after active triggers are installed. With triggers installed, additional network/analysis outbox events are expected; verification requires at least the three seeded disruption events rather than an exact total event count.

Phase 4 seed data creates a repeatable Southern Railway demo network.

## Contents

The seed script inserts:

- 1 demo region.
- 25 stations.
- 60 directed track rows.
- 12 trains.
- 80 scheduled station stops.
- 12 active train journeys.
- 3 disruptions.
- affected train rows.
- route recommendation rows.
- initial history rows, including 5 delay history rows.
- event log rows.

## Command

Run from the project root:

```bash
npm run seed
npm run verify:seed
```

The seed is repeatable. It truncates project data tables and reloads the demo dataset. It does not alter migrations or schema definitions.
