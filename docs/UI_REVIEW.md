# Operator experience review

The original interface was reviewed through its live simulator on 14 September 2026. A Thanjavur station closure and a Chengalpattu–Katpadi track failure were submitted through the UI. Both completed analysis. These two labelled demo records remain in the connected database.

## Problems observed

- No obvious first action or explanation of the operator's role.
- A brief “Creating” button followed by almost no visible analysis feedback.
- “Completed” confused analysis completion with physical incident resolution.
- Empty panels suggested work was still running even after a zero-impact or no-route result.
- Incident cards omitted location; affected rows omitted train identity.
- Routes lacked original-versus-alternative comparison and application failure feedback.
- Long-page navigation made it difficult to find the selected event's results.
- Imported stations without network connections were mixed into the simulation selector.

## Implemented experience

Operations explains the simulation and provides a primary start action. Creating an incident opens a dedicated response URL with a persistent incident ID. The response has a back button, incident switcher, and section links. The incident register has search and open/closed filters. Small screens have a persistent bottom navigation bar. The guide explains the workflow, terminology, databases, and legitimate empty outcomes.

The response shows location, named trains, explicit outcomes, expected delays, original and proposed paths, review/confirmation before applying, server errors, and incident-scoped event activity. Station simulation defaults to connected network stations. Already-disrupted targets are disabled. The map has regional/full-network controls and junction code labels with full names on hover/tap.

## Progress semantics

`GET /api/disruptions/:id/progress` returns committed disruption state, related durable events, and the current stage reported by the analysis process. Stages are emitted from actual execution boundaries: network refresh, impact detection, graph route search, SQL validation, save, and completion after commit. They are advisory process-memory observations for the supported single-backend topology; they are not durable audit entries. A restart loses the stage snapshot, while the database state and outbox remain authoritative. Polling recovers after reconnect. Quick stages can occur between polls.

Loading animations and rotating explanatory text show ongoing work without inventing percentages. Finished state is based on committed database status. The UI distinguishes no affected journeys, no feasible route, saved proposals, applied proposals, and exhausted worker retries. Closed incidents are not automatically repaired or reopened by this interface.

## Verification

- Live browser walkthrough: creation, completed no-route outcome, incident selection, response navigation, guide-to-simulator link, and mobile incident register.
- Nine frontend tests pass, including active progress versus empty outcomes, completed no-impact results, named waiting journeys, worker failure states, and closed incidents that must not suggest waiting for results.
- Backend integration tests cover authenticated progress retrieval, committed completion, existing analysis/application guards, and outbox behavior.
- Production frontend build verified.
