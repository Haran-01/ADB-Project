# Advanced database concept mapping

| Concept | Concrete implementation | Demo evidence |
| --- | --- | --- |
| Relational / 3NF | Regions, stations, directed tracks, trains, schedules, journeys, disruptions and recommendation relationships | migration and foreign-key validation |
| Spatial database | Geography columns, GiST indexes, geometry consistency triggers, nearby/intersection/distance functions, GeoJSON map view | live Leaflet network and spatial invariant checks |
| Graph database | PostgreSQL-to-Neo4j station/track rebuild and bounded alternate-path queries | `npm run graph:verify` validates candidates back in PostgreSQL |
| Temporal database | Schedule day offsets, journey date/state, track validity windows, delay/status history | expired edges are rejected and state changes are historically queryable |
| Active database | Deferred constraint triggers, state/history triggers, durable `event_log`, `pg_notify` | a committed failure creates history/outbox automatically; rollback emits nothing |
| Stored logic | SQL affected-journey detection, route validation, nearby lookup, guarded recommendation apply procedure | database integration tests exercise success, rejection and idempotency |
| Distributed database | `railway_south`, `railway_central`, `railway_north` read projections plus coordinator union/cross-region views | train 12951 spans SR/CR/NR and a BPL–NDLS disruption is detected |
| Data integration | Attributed, checksum-idempotent OSM/normalized JSON importer with rejection capture | public records augment rather than replace the fallback seed |
| Security | RLS, restricted `railway_app` role, removed public schema access, configurable verified TLS, API token | role test reads operational data but cannot rewrite migrations |
| Transaction processing | Atomic disruption creation, analysis lock, guarded procedure transitions, outbox in the same transaction | concurrent/repeated operations cannot apply stale or competing routes |

PostgreSQL remains the source of truth across every concept. Neo4j, regional views, the frontend, and Socket.IO are projections or delivery mechanisms; none independently owns railway state.

