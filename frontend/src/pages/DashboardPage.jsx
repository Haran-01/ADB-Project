import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, Radio, TrainFront, AlertTriangle, MapPin } from 'lucide-react';
import { DisruptionSimulator } from '../components/DisruptionSimulator.jsx';
import { IncidentWorkspace, IncidentEvents, humanize } from '../components/IncidentWorkspace.jsx';
import { Panel, LoadingState, ErrorState, EmptyState } from '../components/UI.jsx';
import { useDisruptions, useJourneys, useNetworkMap, useStations, useTracks } from '../services/queries.js';
const NetworkMap = lazy(() =>
  import('../components/NetworkMap.jsx').then((m) => ({ default: m.NetworkMap })),
);
export function DashboardPage() {
  const disruptions = useDisruptions(),
    journeys = useJourneys(),
    map = useNetworkMap(),
    tracks = useTracks(),
    stations = useStations();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('incident');
  const responseMode = params.get('view') === 'response';
  const [created, setCreated] = useState(null),
    [search, setSearch] = useState('');
  const setSelectedId = (id) => setParams({ incident: id, view: 'response' });
  const active = (disruptions.data ?? []).filter((d) => ['OPEN', 'ANALYZING'].includes(d.status));
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [responseMode, selectedId]);
  const selected =
    disruptions.data?.find((d) => d.id === selectedId) ?? created ?? (responseMode ? active[0] : null);
  const location = (d) => {
    const track = tracks.data?.find((t) => t.track_id === d?.track_id);
    const station = stations.data?.find((s) => s.id === d?.station_id);
    return station
      ? `${station.name} (${station.station_code})`
      : track
        ? `${track.from_station_code} → ${track.to_station_code}`
        : 'Network incident';
  };
  const showResults = () => {
    if (active[0]) setSelectedId(selectedId ?? active[0].id);
  };
  if (responseMode)
    return (
      <div className="response-page">
        <nav className="response-nav" aria-label="Incident navigation">
          <button className="button secondary" onClick={() => setParams({})}>
            ← Back to scenarios
          </button>
          <label>
            Viewing incident
            <select
              value={selected?.id ?? ''}
              onChange={(e) => {
                setCreated(null);
                setSelectedId(e.target.value);
              }}
            >
              {(disruptions.data ?? (created ? [created] : [])).map((d) => (
                <option key={d.id} value={d.id}>
                  {location(d)} · {humanize(d.type)}
                </option>
              ))}
            </select>
          </label>
          <Link className="button secondary" to="/help">
            How does this work?
          </Link>
        </nav>
        {disruptions.isError ? (
          <ErrorState error={disruptions.error} />
        ) : !selected && disruptions.isLoading ? (
          <LoadingState label="Opening incident" />
        ) : (
          <IncidentWorkspace key={selected?.id} incident={selected} location={location(selected)} />
        )}
      </div>
    );
  return (
    <div className="dashboard-grid">
      <section className="welcome wide-panel">
        <div>
          <span className="eyebrow">
            <Radio size={14} /> Railway operations simulator
          </span>
          <h2>
            One disruption.
            <br />
            <em>See the whole response.</em>
          </h2>
          <p>
            You’re the railway operator. Close a junction or block a track, watch the system find affected
            trains, then decide whether to apply a diversion.
          </p>
          <a className="button primary" href="#simulator">
            Start a simulation <ArrowDown size={16} />
          </a>
          <button className="button secondary" disabled={!active.length} onClick={showResults}>
            Explore an existing incident
          </button>
        </div>
        <div className="welcome-flow">
          <div>
            <span>01</span>
            <b>Report an incident</b>
            <small>Choose a station or track</small>
          </div>
          <ArrowDown />
          <div>
            <span>02</span>
            <b>Watch the analysis</b>
            <small>Impact → route search → validation</small>
          </div>
          <ArrowDown />
          <div>
            <span>03</span>
            <b>Choose a response</b>
            <small>Compare and apply a diversion</small>
          </div>
        </div>
      </section>
      <div className="overview-strip wide-panel">
        <span>
          <TrainFront /> <b>{journeys.data?.length ?? '—'}</b> active journeys
        </span>
        <span>
          <AlertTriangle /> <b>{disruptions.data ? active.length : '—'}</b> open incidents
        </span>
        <span>
          <MapPin /> <b>{stations.data?.length ?? '—'}</b> mapped stations
        </span>
        <small>Simulation data · changes are saved</small>
      </div>
      <Panel
        title="Explore the railway"
        eyebrow="Network overview"
        className="map-panel"
        action={<span className="map-legend">● Green: active · Red: unavailable</span>}
      >
        <Suspense fallback={<LoadingState />}>
          <NetworkMap query={map} />
        </Suspense>
        <p className="map-caption">
          Hover over a station for its name. Zoom in to explore junctions. Lines show railway connections.
        </p>
      </Panel>
      <div id="simulator">
        <Panel title="Create your scenario" eyebrow="01 / Start here">
          <DisruptionSimulator
            tracks={tracks.data}
            stations={stations.data}
            onCreated={(d) => {
              setCreated(d);
              setSelectedId(d.id);
            }}
          />
        </Panel>
      </div>
      <Panel
        title="Select an incident to investigate"
        eyebrow="Each event has its own analysis and results"
        className="wide-panel"
        action={
          <label className="search">
            <input
              aria-label="Find an incident"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search location or event…"
            />
          </label>
        }
      >
        {disruptions.isError ? (
          <ErrorState error={disruptions.error} />
        ) : disruptions.isLoading ? (
          <LoadingState />
        ) : active.length ? (
          <div className="disruption-strip">
            {active
              .filter((d) =>
                `${location(d)} ${humanize(d.type)}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((d) => (
                <button
                  aria-pressed={d.id === selectedId}
                  key={d.id}
                  className={`disruption-card ${d.id === selectedId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedId(d.id);
                    setCreated(null);
                  }}
                >
                  <span className="severity-rail" data-severity={d.severity} />
                  <span>
                    <b>{location(d)}</b>
                    <small>
                      {humanize(d.type)} · {humanize(d.severity)}
                    </small>
                    <small>
                      {d.analysis_status === 'COMPLETED'
                        ? 'Analysis ready · incident open'
                        : 'Analysis pending'}
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
          </div>
        ) : (
          <EmptyState
            title="No open incidents"
            message="Create a simulation to see the automatic response."
          />
        )}
      </Panel>
    </div>
  );
}
export function EventTimeline({ query }) {
  if (query.isError) return <ErrorState error={query.error} />;
  if (query.isLoading) return <LoadingState />;
  if (!query.data?.length) return <EmptyState title="No activity found" />;
  return <IncidentEvents events={query.data} />;
}
