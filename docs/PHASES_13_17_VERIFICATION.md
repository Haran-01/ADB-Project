# Phases 13–17 verification

Verified on 14 September 2026 against isolated test databases plus the configured Supabase and Neo4j Aura services.

| Phase | Result | Evidence |
| --- | --- | --- |
| 13 — frontend foundation | Complete | Vite/React app, routing, query/API/socket clients, shell and four pages; production build succeeds |
| 14 — operations dashboard | Complete | PostGIS map, journey/disruption metrics, simulator, affected trains, delay chart, recommendations/apply action, durable timeline and live invalidation |
| 15 — distributed demo | Complete | three regional schemas/views, coordinator views, idempotent SR/CR/NR journey and disruption; scenario checks pass |
| 16 — public import | Complete | provenance migration, normalized station/route/train/schedule importer, rejection capture, checksum idempotency, OSM downloader, graph rebuild |
| 17 — tests and final demo | Complete | isolated API/orchestration/database tests, frontend tests, three scenario types, setup/architecture/concept/demo docs, desktop/mobile screenshots |

## Executed results

- Frontend: 2 test files / 4 tests passed; Vite production build passed with route, map and chart code splitting.
- Project tests: 15 passed, 1 opt-in cloud test skipped, 0 failed.
- Live database invariants: 16/16 passed; all validation changes rolled back.
- Live scenario validation: 17/17 passed; all validation changes rolled back.
- Neo4j: 128 stations and 64 directed track relationships synchronized; three alternate routes validated against PostgreSQL.
- Distributed scenario: one journey with three regional memberships (SR, CR, NR).
- Public import: 105 attributed OSM records read, 101 inserted without replacing existing handcrafted codes; PostgreSQL/Neo4j station total is 128.

The fixture/live split is deliberate: `validate:fixture` checks exact fresh-seed counts, while `validate:db` checks operational invariants and tolerates legitimate event/history growth. `validate:scenario` adds mutation-based checks inside a transaction that is always rolled back.

## Remaining deployment operations

Phase implementation is complete. Before public production exposure, rotate any credentials previously shared outside the secret store and run the backend with a dedicated login that is a member of `railway_app`, not the PostgreSQL owner. These are environment/account operations, not missing application phases.

