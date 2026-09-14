# Active database, spatial analysis and graph projection

## Corrections to Phase 6

The impact summary aggregates affected journeys and recommendations independently, preventing multiplicative delay totals. SQL validation uses a transaction plus a per-check savepoint; every check is rolled back. Reports are written only with `--report`.

Migration files 001–004 remain unchanged. New versioned migrations add event types, integrity constraints, history, outbox leases, and runtime privileges. Logic artifacts are applied in dependency order in one transaction and tracked by SHA-256. The full ordered set is replayed because later files refine earlier functions. Migration/application runners serialize with advisory locks. Shared environment loading supports ordinary dotenv and process overrides, verified TLS, a custom CA, connection/statement timeouts, and bounded retries only for transient connection failures. Failed seed/schema verification exits unsuccessfully.

## Phase 7

ACTIVE → FAILED track updates create a disruption unless the same track already has an unresolved disruption. Status changes append track, train, journey-status, journey-delay and disruption histories. No-op updates do not duplicate status history. `updated_at` is maintained on operational tables. Disruptions, affected journeys, recommendations and network changes create durable outbox records, with NOTIFY on commit.

`analysis_status` is independent of physical `status`; analysis does not resolve a failure. Recommendation procedures validate states and affected pairs, lock the journey to serialize competitors, reject stale routes, persist the applied route, expire competing proposals, and support idempotent reapplication of the same proposal. An applied route for a journey blocks another application until a future explicit route replacement workflow is implemented.

Station points must agree with latitude/longitude. Track geometries must begin/end at the referenced station points within one metre. A track's owning region must own at least one endpoint, permitting future cross-region links. Parent station edits that invalidate existing tracks are rejected. Deferred schedule checks reject removal of stops needed by a current journey. Journey current/next stations must belong to the schedule or applied route. Exactly one disruption target is allowed. Recommendations have a composite FK to their affected journey/disruption pair.

## Phase 8

Geography uses SRID 4326; coordinate order is longitude, latitude. `ST_DWithin`/`ST_Distance` use metres, while API distances are km. `fn_network_geojson()` returns a map FeatureCollection. `fn_affected_tracks(GeoJSON)` uses ST_Intersects. GiST indexes on station, track and disruption geography support spatial filtering.

The seed uses straight-line track geometry because surveyed alignments are unavailable. `distance_km` remains simulated railway operating distance; `geometry_distance_km` is a generated geodesic map-line length. These are intentionally separate measures and must not be forced equal. Speed limits and route estimates use operational distances.

`fn_validate_route` checks every directed edge, active endpoint stations, track status, validity at the predicted entry/exit time, and overlapping unresolved track/station disruptions. Invalid/disconnected paths cannot be stored or applied. The analysis uses `fn_remaining_route` and `fn_affected_journeys`, so already-passed segments do not cause new direct impacts. Legacy full-schedule lookup remains available for historical/demo queries. Journeys starting today or yesterday are considered; longer multiday journeys and repeated-station progress need a richer route-position model beyond this MVP.

## Phase 9

`GraphProjection` reads stations/tracks from PostgreSQL and writes only `RailwayStation` nodes and `CONNECTED_TO` relationships owned by its `projection` property. The production projection is `railway-main`; tests use a random isolated namespace and clean it afterward. No unscoped graph clear is performed. Rebuilds replace owned relationships and remove obsolete owned nodes atomically in Neo4j, serialized by a PostgreSQL advisory lock.

Node fields: stationId, stationCode, name, latitude, longitude, regionCode, status, available. Track fields: trackId, fromId, toId, distanceKm, speedLimitKmph, travelMinutes, status, region/regionCode, validFrom, validTo, available. IDs originate in PostgreSQL. Constraints ensure stable station identity.

Routes are directed, simple paths of 1–12 hops, ranked by travel time, excluding unavailable stations/tracks; at most three candidates are returned. SQL performs final temporal checks after graph lookup. Full rebuild is suitable for the 25-station MVP; large production networks require incremental synchronization and more scalable route algorithms.

## Security

`railway_main` denies PUBLIC, Supabase anon, and authenticated roles. Every table enables RLS. A NOLOGIN `railway_app` role has explicit runtime grants and server-only RLS policies; it cannot modify migration metadata or execute schema migrations. Provision a separate login and grant it membership in railway_app; retain the schema owner only for deployment. The API uses an optional local-development token, mandatory for production/non-loopback access. Do not expose service-role keys or database credentials to a frontend.

PGlite/PostGIS tests run real PostgreSQL SQL in an isolated WASM runtime. This is not a substitute for cloud connection, permission, concurrent-client, or production performance verification. Live Aura tests verify actual Cypher against an isolated projection. Supabase deployment evidence is tracked separately.
