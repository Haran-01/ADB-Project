import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IncidentWorkspace } from './IncidentWorkspace.jsx';
const state = vi.hoisted(() => ({ progress: {}, affected: {}, routes: {} }));
vi.mock('../services/queries.js', () => ({
  useProgress: () => state.progress,
  useAffected: () => state.affected,
  useRecommendations: () => state.routes,
  useJourneys: () => ({ data: [] }),
  useTrains: () => ({ data: [] }),
  useApplyRecommendation: () => ({}),
}));
const incident = {
  id: 'demo-id',
  type: 'STATION_CLOSURE',
  severity: 'HIGH',
  status: 'OPEN',
  analysis_status: 'PENDING',
};
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <IncidentWorkspace incident={incident} location="Thanjavur Junction" />
    </QueryClientProvider>,
  );
beforeEach(() => {
  state.progress = {
    data: {
      disruption: incident,
      events: [],
      progress: { stage: 'network', detail: 'Refreshing the railway routing network.' },
    },
  };
  state.affected = { data: [] };
  state.routes = { data: [] };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('incident feedback', () => {
  it('does not suggest waiting for results on a closed incident', () => {
    state.progress.data.disruption = { ...incident, status: 'RESOLVED' };
    show();
    expect(screen.getByText('Incident closed')).toBeInTheDocument();
    expect(screen.getByText('Review the incident record')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting impact results')).not.toBeInTheDocument();
    expect(screen.queryByText('WORKING')).not.toBeInTheDocument();
  });
  it('shows reported work without prematurely calling empty results complete', () => {
    show();
    expect(screen.getByText('Refreshing the railway routing network.')).toBeInTheDocument();
    expect(screen.queryByText('No active journeys affected')).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting impact results')).toBeInTheDocument();
  });
  it('explains a completed zero-impact analysis', () => {
    state.progress.data.disruption = { ...incident, analysis_status: 'COMPLETED' };
    show();
    expect(screen.getByText('No active journeys affected')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting impact results')).not.toBeInTheDocument();
    expect(screen.getByText('Incident still open')).toBeInTheDocument();
  });
  it('shows train identity and unresolved delay when no route is found', () => {
    state.progress.data.disruption = { ...incident, analysis_status: 'COMPLETED' };
    state.affected = {
      data: [
        {
          id: 'impact',
          train_journey_id: 'journey',
          train_number: '16853',
          train_name: 'Chord Demo',
          impact_type: 'STATION_CLOSURE',
          status: 'WAITING',
          estimated_delay_minutes: 0,
        },
      ],
    };
    show();
    expect(screen.getByText('16853 · Chord Demo')).toBeInTheDocument();
    expect(screen.getByText('Unresolved')).toBeInTheDocument();
    expect(screen.getByText(/No feasible alternate route was found/)).toBeInTheDocument();
  });
  it('stops presenting failed work as active analysis', () => {
    state.progress.data.events = [
      { id: 'event', event_type: 'DISRUPTION_CREATED', status: 'FAILED', created_at: null },
    ];
    show();
    expect(screen.getByText('Analysis needs attention')).toBeInTheDocument();
    expect(screen.queryByText('WORKING')).not.toBeInTheDocument();
  });
});
