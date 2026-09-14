# Phase 15 — Regional distribution demonstration

The MVP demonstrates logical distribution inside one Supabase PostgreSQL database. This is the documented “equivalent views” option from the build plan and avoids circular self-connections or extra cloud projects during the classroom demo.

Migration 008 exposes read-only `stations` and `tracks` views in `railway_south`, `railway_central`, and `railway_north`. `railway_main.v_distributed_stations` and `v_distributed_tracks` provide the coordinator view, while `v_cross_region_journeys` identifies schedules spanning two or more regions. Every authoritative row remains in `railway_main`; regional views cannot diverge.

Run the idempotent scenario after migrations and logic:

```bash
npm run demo:distributed
npm run validate:scenario
npm run graph:sync
```

It adds Central and Northern region records, Bhopal and New Delhi stations, four directed regional links, train 12951 from Bengaluru through Bhopal to New Delhi, today's journey, and an open Bhopal–Delhi maintenance disruption. Existing handcrafted Southern data is retained. Running it again updates the named objects without duplicating them.

The disruption is discoverable by `fn_affected_journeys`; the worker can analyze it using the same outbox flow. The direct Bhopal–Delhi demo has no alternate route, so WAITING is a valid operational result until a second corridor is added.

For a physical distributed deployment, replace each regional view with foreign tables backed by independent PostgreSQL servers and a `postgres_fdw` server/user mapping. The coordinator view and application contract can remain stable. Credentials and network topology belong in deployment infrastructure, not migrations committed to this repository.
