import { useState } from 'react';
import { EventTimeline } from './DashboardPage.jsx';
import { Panel } from '../components/UI.jsx';
import { useEvents } from '../services/queries.js';
export function HistoryPage() {
  const events = useEvents();
  const [filter, setFilter] = useState('ALL');
  const filtered = {
    ...events,
    data: filter === 'ALL' ? events.data : events.data?.filter((e) => e.event_type === filter),
  };
  const types = [...new Set(events.data?.map((e) => e.event_type) ?? [])];
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">System activity</span>
        <h2>Follow the work recorded by the system.</h2>
        <p>
          This is activity across all incidents. For a focused story, open an incident’s response and select
          Behind the scenes. Processed means the worker handled the event.
        </p>
      </div>
      <Panel
        title="Committed event history"
        eyebrow="Durable PostgreSQL outbox"
        action={
          <select aria-label="Filter event type" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All event types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        }
      >
        <EventTimeline query={filtered} />
      </Panel>
    </>
  );
}
