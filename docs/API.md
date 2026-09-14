# Backend API — Phases 10–11

Base URL: `http://127.0.0.1:4000/api`. With `API_TOKEN` configured, every endpoint except health requires `Authorization: Bearer <token>`. Tokens represent a trusted demo operator; user accounts and per-operator authorization are outside this phase.

| Method | Path | Response / purpose |
| --- | --- | --- |
| GET | `/health` | Process health |
| GET | `/health/db` | PostgreSQL connectivity; 503 when unavailable |
| GET | `/health/neo4j` | Connectivity to configured Neo4j database |
| GET | `/stations` | Station master rows |
| GET | `/stations/nearby?lat=12.68&lng=79.98&radius_km=50` | PostGIS radius lookup, distances in km |
| GET | `/tracks` | Network reporting view |
| GET | `/network/map` | GeoJSON FeatureCollection: station and track features |
| GET | `/trains` | Train master rows |
| GET | `/trains/:id/schedule` | Ordered SQL schedule function |
| GET | `/journeys/active` | Active journey reporting view |
| GET | `/disruptions` | Disruptions including physical and analysis status |
| GET | `/disruptions/:id/progress` | Committed disruption, related events, and advisory stage from the running analysis process |
| POST | `/disruptions` | Create disruption; track failure also fails track; station closure also closes station |
| GET | `/disruptions/:id/affected-trains` | Persisted affected journeys |
| GET | `/disruptions/:id/recommendations` | Persisted route proposals |
| POST | `/disruptions/:id/analyze` | SQL detection → Neo4j → SQL feasibility and persistence |
| POST | `/recommendations/:id/apply` | Apply feasible proposal; repeat application is a no-op |
| GET | `/routing/alternatives?from=CGL&to=TPJ` | At most 3 graph candidates revalidated by PostgreSQL |
| GET | `/events` | Durable event timeline; descending event sequence |

Lists return `{ data, limit, offset }`; default limit 100, maximum 200. Individual operations return `{ data }`. `/network/map` returns GeoJSON directly. Spatial/routing helpers return `{ data }`.

Disruption body:

```json
{
  "type": "TRACK_FAILURE",
  "track_id": "UUID_FROM_TRACKS_API",
  "severity": "HIGH",
  "description": "Demo track circuit failure"
}
```

Exactly one `track_id` or `station_id` is required. `TRACK_FAILURE` requires a track; `STATION_CLOSURE` requires a station. Types: TRACK_FAILURE, ACCIDENT, MAINTENANCE, STATION_CLOSURE, ROUTE_BLOCKAGE. Severities: LOW, MEDIUM, HIGH, CRITICAL. The server rejects unknown body fields, invalid UUIDs, negative/out-of-range pagination, and bodies over 32 KiB. A target with an unresolved disruption returns 409.

Errors: 400 invalid input, 401 unauthorized, 404 missing record, 409 database/state conflict, 413 body too large, 503 unavailable dependency. Database SQL and credentials are not exposed in error responses.

Analysis is serialized by a PostgreSQL row lock. Repeating a completed analysis returns `already_analyzed: true`; successful analysis leaves the physical disruption open/analyzing until a separate repair workflow resolves it. No feasible candidate leaves the affected journey WAITING. Applying rejects closed disruptions, expired/rejected proposals, completed/cancelled journeys, stale routes and competing applied routes. The journey's effective route and next station are updated and history/outbox rows are created in the same transaction.

Long graph queries are bounded to 12 hops and a 10-second query timeout for the small MVP. API analysis is synchronous; the event worker also invokes the same service automatically. Before scaling beyond the demo network, replace bounded path enumeration with a graph algorithm designed for larger networks and introduce asynchronous job status APIs.
