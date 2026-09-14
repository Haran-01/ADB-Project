# System architecture

```mermaid
flowchart LR
  UI[React operations dashboard] <-->|REST + Socket.IO| API[Express API]
  API --> Analysis[Analysis orchestrator]
  Worker[Durable outbox worker] --> Analysis
  Worker --> UI
  Analysis --> PG[(Supabase PostgreSQL)]
  Analysis --> Neo[(Neo4j Aura projection)]
  PG -->|migrations + graph sync| Neo
  PG --> PostGIS[PostGIS spatial functions]
  PG --> Outbox[event_log + NOTIFY]
  Outbox --> Worker
  Regional[South / Central / North views] --> PG
  Import[Attributed public-data importer] --> PG
```

## Responsibilities

PostgreSQL owns stations, tracks, schedules, journeys, disruptions, recommendations, history, constraints, and the durable event outbox. PostGIS owns geometry validation, distance/intersection analysis, nearby-station lookup, and GeoJSON generation. Neo4j contains only synchronized station/track projections used to propose paths; every candidate is revalidated against current PostgreSQL availability and time windows.

The Express layer validates HTTP input and coordinates the database/graph services. It does not duplicate SQL impact, feasibility, transition, or reporting rules. The worker consumes `event_log` with leases and fencing tokens, runs analysis, and publishes committed events to Socket.IO. PostgreSQL `NOTIFY` is a wake-up hint; polling the durable outbox prevents notification loss from losing work.

The React layer uses TanStack Query for server state, Socket.IO only to invalidate/refetch committed state, React Router for four screens, Leaflet for PostGIS GeoJSON, and Recharts for delay exposure. Feature pages are code-split; business decisions remain in the backend/database.

## End-to-end state flow

```mermaid
sequenceDiagram
  participant O as Operator
  participant R as React
  participant A as Express
  participant P as PostgreSQL/PostGIS
  participant W as Outbox worker
  participant N as Neo4j
  O->>R: Create disruption
  R->>A: POST /api/disruptions
  A->>P: Atomic disruption + state/history/event
  P-->>W: NOTIFY wake-up
  W->>P: Claim durable event and detect affected journeys
  W->>N: Find alternate paths
  W->>P: Validate and store recommendations
  W-->>R: Socket.IO committed event
  R->>A: Refetch current read models
  A->>P: Reporting/spatial views
  A-->>R: Render updated map, impact and timeline
```

## Trust and deployment boundaries

- Anonymous and authenticated Supabase roles have no access to `railway_main`; API access is server-side.
- `railway_app` has the runtime table/routine privileges and Row Level Security policies, but not migration rewrite privileges.
- TLS verification is secure by default; insecure remote TLS requires an explicit opt-in.
- API bearer authentication is required for non-loopback/shared deployment.
- The supported realtime topology is one API/Socket.IO process. Multiple instances require a shared Socket.IO adapter.

