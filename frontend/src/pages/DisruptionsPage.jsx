import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDisruptions, useTracks, useStations } from '../services/queries.js';
import { Panel, ErrorState, LoadingState, EmptyState, formatTime } from '../components/UI.jsx';
import { humanize } from '../components/IncidentWorkspace.jsx';
export function DisruptionsPage() {
  const disruptions = useDisruptions(),
    tracks = useTracks(),
    stations = useStations();
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('');
  const location = (d) => {
    const t = tracks.data?.find((t) => t.track_id === d.track_id),
      s = stations.data?.find((s) => s.id === d.station_id);
    return s
      ? `${s.name} (${s.station_code})`
      : t
        ? `${t.from_station_code} → ${t.to_station_code}`
        : 'Network incident';
  };
  const data = (disruptions.data ?? []).filter(
    (d) =>
      (filter === 'all' ||
        (filter === 'open'
          ? ['OPEN', 'ANALYZING'].includes(d.status)
          : ['RESOLVED', 'CANCELLED'].includes(d.status))) &&
      `${location(d)} ${d.description ?? ''} ${humanize(d.type)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">Incident register</span>
        <h2>Find an event. Follow its response.</h2>
        <p>
          Open an incident to see its analysis, affected trains and diversion options. Closed events stay here
          as a record.
        </p>
        <Link to="/#simulator" className="button primary">
          + Simulate a new event
        </Link>
      </div>
      <Panel
        title="Railway incidents"
        action={
          <div className="register-controls">
            <input
              aria-label="Search incidents"
              placeholder="Search station, track or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Incident status" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All incidents</option>
              <option value="open">Open incidents</option>
              <option value="closed">Closed incidents</option>
            </select>
          </div>
        }
      >
        {disruptions.isLoading ? (
          <LoadingState />
        ) : disruptions.isError ? (
          <ErrorState error={disruptions.error} />
        ) : data.length ? (
          <div className="incident-register">
            {data.map((d) => (
              <Link className="incident-row" key={d.id} to={`/?view=response&incident=${d.id}`}>
                <div>
                  <span className="eyebrow">
                    {humanize(d.type)} · {humanize(d.severity)}
                  </span>
                  <h3>{location(d)}</h3>
                  <p>{d.description || 'No operator note'}</p>
                  <small>{formatTime(d.started_at)}</small>
                </div>
                <div>
                  <span className="incident-state">
                    {['OPEN', 'ANALYZING'].includes(d.status) ? 'Open incident' : humanize(d.status)}
                  </span>
                  <p>
                    {d.analysis_status === 'COMPLETED'
                      ? 'Analysis ready'
                      : ['RESOLVED', 'CANCELLED'].includes(d.status)
                        ? 'Closed · no analysis running'
                        : 'Analysis pending'}
                  </p>
                  <b>View response →</b>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matching incidents"
            message="Try a different search or change the status filter."
          />
        )}
      </Panel>
    </>
  );
}
