import { useMemo, useState } from 'react';
import { DisruptionSimulator } from '../components/DisruptionSimulator.jsx';
import { IncidentWorkspace } from '../components/IncidentWorkspace.jsx';
import { EmptyState, ErrorState, LoadingState, Panel, StatusPill, formatTime } from '../components/UI.jsx';
import {
  useAffected,
  useDisruptions,
  useRecommendations,
  useStations,
  useTracks,
} from '../services/queries.js';

export function DisruptionsPage() {
  const disruptions = useDisruptions(),
    tracks = useTracks(),
    stations = useStations();
  const [selected, setSelected] = useState(null);
  const selectedId = selected ?? disruptions.data?.[0]?.id;
  const affected = useAffected(selectedId),
    recommendations = useRecommendations(selectedId);
  const current = useMemo(
    () => disruptions.data?.find((d) => d.id === selectedId),
    [disruptions.data, selectedId],
  );
  return (
    <div className="page-grid two-column">
      <Panel title="Create an event" eyebrow="Operator controls">
        <DisruptionSimulator
          tracks={tracks.data}
          stations={stations.data}
          onCreated={(d) => setSelected(d.id)}
        />
      </Panel>
      <Panel title="Disruption register" eyebrow="Physical and analysis state" className="span-tall">
        {disruptions.isLoading ? (
          <LoadingState />
        ) : disruptions.isError ? (
          <ErrorState error={disruptions.error} />
        ) : (
          <div className="record-list">
            {disruptions.data?.map((d) => (
              <button
                className={d.id === selectedId ? 'selected' : ''}
                key={d.id}
                onClick={() => setSelected(d.id)}
              >
                <span className="severity-rail" data-severity={d.severity} />
                <div>
                  <b>{String(d.type).replaceAll('_', ' ')}</b>
                  <small>
                    {d.description || 'No operator note'} · {formatTime(d.started_at)}
                  </small>
                </div>
                <StatusPill value={d.status} />
                <StatusPill value={d.analysis_status} />
              </button>
            ))}
          </div>
        )}
      </Panel>
      <IncidentWorkspace
        incident={current}
        location={
          stations.data?.find((s) => s.id === current?.station_id)?.name ??
          (() => {
            const t = tracks.data?.find((t) => t.track_id === current?.track_id);
            return t ? `${t.from_station_code} → ${t.to_station_code}` : 'Selected incident';
          })()
        }
      />
    </div>
  );
}
function CompactRecords({ query, empty, children }) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data?.length) return <EmptyState title={empty} />;
  return (
    <div className="compact-records">
      <header>{children}</header>
      {query.data.map((r) => (
        <article key={r.id}>
          <span>{r.recommended_route?.join(' → ') ?? String(r.impact_type).replaceAll('_', ' ')}</span>
          <span>
            {r.recommended_route ? <StatusPill value={r.status} /> : r.estimated_delay_minutes + ' min'}
          </span>
        </article>
      ))}
    </div>
  );
}
