import { lazy, Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, AlertTriangle, ArrowRight, TrainFront } from 'lucide-react';
import {
  useAffected,
  useApplyRecommendation,
  useJourneys,
  useProgress,
  useRecommendations,
  useTrains,
} from '../services/queries.js';
import { EmptyState, ErrorState, LoadingState, Panel, StatusPill, formatTime } from './UI.jsx';
const DelayChart = lazy(() => import('./DelayChart.jsx').then((m) => ({ default: m.DelayChart })));
export const humanize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
const stages = [
  ['network', 'Refresh network'],
  ['impact', 'Find affected trains'],
  ['routing', 'Search diversions'],
  ['validation', 'Validate routes'],
  ['saving', 'Save results'],
];
const hints = [
  'Your event is saved. The worker checks the network automatically.',
  'Routes are checked against current closures and track availability.',
  'Results appear after the analysis transaction commits.',
];
export function IncidentWorkspace({ incident, location }) {
  const progress = useProgress(incident?.id),
    affected = useAffected(incident?.id),
    routes = useRecommendations(incident?.id),
    journeys = useJourneys(),
    trains = useTrains(),
    apply = useApplyRecommendation();
  const client = useQueryClient();
  useEffect(() => {
    if (progress.data?.disruption.analysis_status === 'COMPLETED') {
      client.invalidateQueries({ queryKey: ['affected', incident?.id] });
      client.invalidateQueries({ queryKey: ['recommendations', incident?.id] });
    }
  }, [progress.data?.disruption.analysis_status, incident?.id, client]);
  const [hint, setHint] = useState(0),
    [confirmId, setConfirmId] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setHint((n) => (n + 1) % hints.length), 4000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setConfirmId(null), [incident?.id]);
  if (!incident)
    return (
      <Panel title="Your incident workspace" className="wide-panel">
        <EmptyState
          title="Start with a railway event"
          message="Use the simulator or select an incident to see its analysis here."
        />
      </Panel>
    );
  const d = progress.data?.disruption ?? incident,
    complete = d.analysis_status === 'COMPLETED',
    closed = ['RESOLVED', 'CANCELLED'].includes(d.status);
  const failed = progress.data?.events?.some(
    (e) => e.event_type === 'DISRUPTION_CREATED' && e.status === 'FAILED',
  );
  const stage = progress.data?.progress,
    current = stages.findIndex(([key]) => key === stage?.stage);
  const appliedCount = routes.data?.filter((r) => r.status === 'APPLIED').length ?? 0;
  const waitingTooLong =
    !complete && !stage && Date.now() - new Date(d.created_at ?? d.started_at).getTime() > 30000;
  const trainLabel = (id) => {
    const row =
      (affected.data ?? []).find((a) => a.train_journey_id === id) ??
      (routes.data ?? []).find((a) => a.train_journey_id === id);
    if (row?.train_number) return `${row.train_number} · ${row.train_name}`;
    const j = journeys.data?.find((j) => j.train_journey_id === id);
    const t = trains.data?.find((t) => t.id === j?.train_id);
    return t ? `${t.train_number} · ${t.name}` : `Journey ${id?.slice(0, 8)}`;
  };
  return (
    <section className="incident-workspace wide-panel" id="incident-workspace">
      <div className="incident-heading">
        <div>
          <span className="eyebrow">02 / Follow the response</span>
          <h2>{location}</h2>
          <p>
            {humanize(d.type)} · {humanize(d.severity)} severity · {formatTime(d.started_at)}
          </p>
        </div>
        <span className="incident-state">{closed ? humanize(d.status) : 'Incident still open'}</span>
      </div>
      <nav className="workspace-jumps" aria-label="Response sections">
        <a href="#analysis-summary">Analysis & outcome</a>
        <a href="#diversion-options">Diversion options {routes.data ? `(${routes.data.length})` : ''}</a>
        <a href="#incident-activity">Behind the scenes</a>
      </nav>
      <div
        id="analysis-summary"
        className={`analysis-console ${complete ? 'finished' : ''}`}
        aria-live="polite"
        aria-busy={!complete && !failed && !closed}
      >
        <div className="analysis-title">
          {complete ? (
            <CheckCircle2 />
          ) : failed || closed ? (
            <AlertTriangle />
          ) : (
            <LoaderCircle className="spin" />
          )}
          <div>
            <h3>
              {complete
                ? 'Analysis finished — review the outcome'
                : failed
                  ? 'Analysis needs attention'
                  : closed
                    ? 'Incident closed'
                    : (stage?.detail ??
                      (waitingTooLong
                        ? 'Waiting for the worker to start'
                        : 'Event saved · waiting for the analysis worker'))}
            </h3>
            <p>
              {complete
                ? 'Analysis completion does not reopen a closed station or repair a failed track.'
                : failed
                  ? 'The worker exhausted its retries. Check backend connectivity and event activity.'
                  : closed
                    ? 'No further analysis is required.'
                    : waitingTooLong
                      ? 'The worker may be busy or disconnected. Keep this page open; updates will resume automatically when it starts.'
                      : hints[hint]}
            </p>
          </div>
          {!complete && !failed && !closed && <span className="live-tag">WORKING</span>}
        </div>
        <ol className="analysis-steps">
          {stages.map(([key, label], i) => (
            <li
              key={key}
              className={complete ? 'done' : !closed && !failed && current === i ? 'current' : ''}
            >
              <span>
                {complete ? (
                  <CheckCircle2 size={17} />
                ) : !closed && !failed && current === i ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  i + 1
                )}
              </span>
              {complete && affected.data?.length === 0 && ['routing', 'validation'].includes(key)
                ? `${label} · not needed`
                : label}
            </li>
          ))}
        </ol>
        {!complete && !closed && !failed && (
          <div className="indeterminate">
            <i />
          </div>
        )}
        {progress.isError && (
          <p className="form-error">
            Progress unavailable: {progress.error.message}. Waiting for the API to reconnect.
          </p>
        )}
      </div>
      {complete && affected.data && routes.data && (
        <div className="outcome-callout">
          <b>
            {affected.data.length === 0
              ? 'No active journeys affected'
              : `${affected.data.length} affected journey${affected.data.length === 1 ? '' : 's'} · ${routes.data.length} route proposal${routes.data.length === 1 ? '' : 's'}`}
          </b>
          <p>
            {affected.data.length === 0
              ? 'The remaining routes of active journeys do not pass through this location. No reroute is required.'
              : appliedCount
                ? `${appliedCount} diversion${appliedCount === 1 ? ' has' : 's have'} been applied. The saved journey route has been updated; the incident is ${closed ? 'closed' : 'still open'}.`
                : routes.data.length
                  ? 'Compare the original and proposed paths below. Applying a proposal changes that journey in the database.'
                  : 'No feasible alternate route was found in the current network. Affected journeys remain waiting; a zero recorded delay does not mean the route is clear.'}
          </p>
        </div>
      )}
      <div className="response-grid">
        <Panel title="Trains that need attention" eyebrow="03 / Understand the impact">
          {affected.isError ? (
            <ErrorState error={affected.error} />
          ) : affected.isLoading ? (
            <LoadingState label="Loading affected journeys" />
          ) : affected.data?.length ? (
            <div className="impact-list">
              {affected.data.map((a) => (
                <article key={a.id}>
                  <TrainFront />
                  <div>
                    <b>{trainLabel(a.train_journey_id)}</b>
                    <p>{humanize(a.impact_type)}</p>
                  </div>
                  <div>
                    <strong>
                      {a.status === 'WAITING' && Number(a.estimated_delay_minutes) === 0
                        ? 'Unresolved'
                        : `${a.estimated_delay_minutes} min`}
                    </strong>
                    <StatusPill value={a.status} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                complete
                  ? 'No journeys need a diversion'
                  : closed
                    ? 'No recorded impact'
                    : failed
                      ? 'Impact results unavailable'
                      : 'Awaiting impact results'
              }
              message={
                complete
                  ? 'The event was analysed successfully.'
                  : closed
                    ? 'This incident is closed. No further results are expected.'
                    : failed
                      ? 'Analysis did not complete. See incident activity below.'
                      : 'Results appear when analysis commits.'
              }
            />
          )}
        </Panel>
        <Panel title="Your next action" eyebrow="Operator decision">
          <div className="next-action">
            <ArrowRight />
            <h3>
              {closed
                ? 'Review the incident record'
                : failed
                  ? 'Check the worker connection'
                  : routes.data?.some((r) => r.status === 'PROPOSED')
                    ? 'Review a proposed diversion'
                    : appliedCount
                      ? 'Diversion applied — monitor the journey'
                      : complete
                        ? 'Monitor the incident'
                        : 'Follow the analysis above'}
            </h3>
            <p>
              {closed
                ? 'This incident is closed. Its saved impact, routes and activity remain available for review.'
                : failed
                  ? 'The analysis could not finish. Review the event activity and backend connection before retrying.'
                  : appliedCount
                    ? 'The journey has been updated. Check Trains for its current status and delay. The physical disruption still needs to be monitored.'
                    : complete
                      ? 'Review the proposed stops and expected delay before applying a reroute. If there is no feasible diversion, keep the incident under observation.'
                      : 'The backend detects affected trains and validates routes. You do not need to submit the event again.'}
            </p>
            {!closed && routes.data?.some((r) => r.status === 'PROPOSED') && (
              <a className="button primary" href="#diversion-options">
                Compare options ↓
              </a>
            )}
          </div>
        </Panel>
      </div>
      {affected.data?.some((a) => Number(a.estimated_delay_minutes) > 0) && (
        <Panel title="Estimated delay by train" eyebrow="Minutes recorded for this incident">
          <Suspense fallback={<LoadingState label="Loading delay chart" />}>
            <DelayChart
              data={affected.data
                .filter((a) => !(a.status === 'WAITING' && Number(a.estimated_delay_minutes) === 0))
                .map((a) => ({
                  name: a.train_number ?? trainLabel(a.train_journey_id).split(' · ')[0],
                  delay: Number(a.estimated_delay_minutes),
                }))}
            />
          </Suspense>
        </Panel>
      )}
      <div id="diversion-options">
        <Panel title="Compare diversion options" eyebrow="04 / Review, then apply">
          {routes.isError ? (
            <ErrorState error={routes.error} />
          ) : routes.isLoading ? (
            <LoadingState label="Loading diversion proposals" />
          ) : routes.data?.length ? (
            <div className="proposal-list">
              {routes.data.map((r) => (
                <article className="proposal" key={r.id}>
                  <header>
                    <b>{trainLabel(r.train_journey_id)}</b>
                    <StatusPill value={r.status} />
                  </header>
                  <div className="path-comparison">
                    <div>
                      <small>Original remaining route</small>
                      <p>{r.original_route?.join(' → ') ?? 'Not recorded'}</p>
                    </div>
                    <div>
                      <small>Proposed diversion</small>
                      <p>{r.recommended_route?.join(' → ')}</p>
                    </div>
                  </div>
                  <footer>
                    <span>
                      <b>{r.distance_km} km</b> route distance
                    </span>
                    <span>
                      <b>{r.estimated_travel_minutes} min</b> travel time
                    </span>
                    <span>
                      <b>+{r.estimated_delay_minutes} min</b> estimated delay
                    </span>
                    {r.status === 'PROPOSED' && !closed && (
                      <button
                        className="button primary"
                        disabled={apply.isPending}
                        onClick={() => setConfirmId(r.id)}
                      >
                        Review & apply
                      </button>
                    )}
                  </footer>
                  {confirmId === r.id && (
                    <div className="apply-confirm">
                      <p>
                        Apply this path to <b>{trainLabel(r.train_journey_id)}</b>? The database will recheck
                        availability and update the journey.
                      </p>
                      <button
                        className="button primary"
                        disabled={apply.isPending}
                        onClick={() => apply.mutate(r.id, { onSuccess: () => setConfirmId(null) })}
                      >
                        {apply.isPending ? 'Validating & applying…' : 'Confirm reroute'}
                      </button>
                      <button
                        className="button secondary"
                        disabled={apply.isPending}
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                complete || closed
                  ? 'No diversion proposals'
                  : failed
                    ? 'Route analysis incomplete'
                    : 'Waiting for route analysis'
              }
              message={
                closed
                  ? 'No routes were recorded for this closed incident.'
                  : failed
                    ? 'See incident activity for the failed analysis event.'
                    : complete
                      ? 'See the analysis outcome above for what this means.'
                      : 'Only routes that pass database checks will appear here.'
              }
            />
          )}
          {apply.isError && (
            <p role="alert" className="form-error action-message">
              Could not apply: {apply.error.message}
            </p>
          )}
          {apply.isSuccess && (
            <p role="status" className="form-success action-message">
              Reroute applied. The journey and history have been updated.
            </p>
          )}
        </Panel>
      </div>
      <div id="incident-activity">
        <Panel title="What happened behind the scenes" eyebrow="Activity for this incident">
          <IncidentEvents events={progress.data?.events ?? []} />
        </Panel>
      </div>
    </section>
  );
}
export function IncidentEvents({ events }) {
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="timeline-icon">
            <CheckCircle2 size={16} />
          </span>
          <div>
            <b>{humanize(e.event_type)}</b>
            <small>
              {formatTime(e.created_at)} · event {e.event_sequence}
            </small>
          </div>
          <StatusPill value={e.status} />
        </li>
      ))}
    </ol>
  );
}
