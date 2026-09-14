# Realtime worker — Phase 12

`npm start` starts Express, Socket.IO, and the outbox worker. `WORKER_ENABLED=false` runs only the API. The default polling interval is 2 seconds; `WORKER_POLL_MS` configures it.

PostgreSQL triggers insert durable `event_log` rows. An AFTER INSERT trigger calls `pg_notify('railway_events', '{"event_id":"..."}')`. Notifications are delivered on commit; rolled-back operations publish nothing. A dedicated direct/session-pooled connection listens. Lost connections reconnect, and polling continues even if LISTEN is unavailable. Notifications are wakeup hints; the durable outbox is authoritative.

| Database event | Socket.IO event |
| --- | --- |
| DISRUPTION_CREATED | `disruption.created` |
| DISRUPTION_ANALYSIS_REQUESTED | `disruption.analysis_started` |
| DISRUPTION_ANALYSIS_COMPLETED | `disruption.analysis_completed` |
| TRAIN_AFFECTED | `train.affected` |
| ROUTE_RECOMMENDED | `route.recommended` |
| JOURNEY_STATUS_CHANGED / TRAIN_STATUS_CHANGED | `train.status_updated` |

Each socket message includes `event_id`, monotonic `event_sequence`, and entity identifiers. Connect with Socket.IO `io(baseUrl, { auth: { token } })` when API_TOKEN is configured. Refresh relevant REST data when events arrive.

Disruption-created events invoke the shared analysis service. Network/track changes refresh Neo4j; older pending network events are coalesced into the newest committed snapshot. Event rows are claimed atomically with `FOR UPDATE SKIP LOCKED`. Claims have a UUID fencing token, a 120-second lease, and a 30-second heartbeat. Success acknowledges only the matching token. Failures retry with exponential backoff, capped at 60 seconds, up to 5 attempts. Expired claims are recovered; exhausted events become FAILED. Inspect `/api/events` or `event_log.last_error` to diagnose failures. After fixing a dependency, a trusted administrator can reset a specific failed event to PENDING with attempts=0 and available_at=now().

Delivery is at least once to connected clients: a crash between emission and acknowledgment may duplicate a message. Clients should deduplicate `event_id` and refresh via REST after reconnect; Socket.IO is not a replay log. One backend process is the supported deployment topology. Multiple Socket.IO servers need a shared adapter/broadcast design before scaling.

Analysis-started and completed outbox entries are persisted in the analysis transaction and become visible after it commits. They communicate ordered committed state changes, not speculative progress inside an open transaction. `event_sequence` determines ordering when events share a transaction timestamp.

SIGINT/SIGTERM stops polling, closes the listener, drains current work, and closes sockets/database clients. A shutdown watchdog exits after 20 seconds; any unacknowledged claim is subsequently recovered through its lease.
