import { Search, TrainFront } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, Panel, StatusPill, formatMinutes } from '../components/UI.jsx';
import { useJourneys, useTrains } from '../services/queries.js';

export function TrainsPage() {
  const trains = useTrains(),
    journeys = useJourneys();
  const [search, setSearch] = useState('');
  const data = useMemo(
    () =>
      trains.data?.filter((t) =>
        `${t.train_number} ${t.name}`.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [trains.data, search],
  );
  const journeyByTrain = new Map(journeys.data?.map((j) => [j.train_id, j]) ?? []);
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">Train movements</span>
        <h2>Where are your trains now?</h2>
        <p>
          Search by number or name. Current and next stations show the simulated journey position; delays
          change when an operator applies a diversion.
        </p>
      </div>
      <Panel
        title="Fleet register"
        eyebrow="Master data and today's movement"
        action={
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search trains"
              placeholder="Search train or number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        }
      >
        {trains.isLoading ? (
          <LoadingState />
        ) : trains.isError ? (
          <ErrorState error={trains.error} />
        ) : data.length ? (
          <div className="train-grid">
            {data.map((train) => {
              const journey = journeyByTrain.get(train.id);
              return (
                <article className="train-card" key={train.id}>
                  <header>
                    <span>
                      <TrainFront size={20} />
                    </span>
                    <div>
                      <small>{train.train_number}</small>
                      <h3>{train.name}</h3>
                    </div>
                    <StatusPill value={journey?.journey_status ?? train.status} />
                  </header>
                  <dl>
                    <div>
                      <dt>Type</dt>
                      <dd>{train.train_type}</dd>
                    </div>
                    <div>
                      <dt>Priority</dt>
                      <dd>P{train.priority}</dd>
                    </div>
                    <div>
                      <dt>Current delay</dt>
                      <dd>{journey ? formatMinutes(journey.delay_minutes) : 'No active journey'}</dd>
                    </div>
                  </dl>
                  {journey && (
                    <p>
                      Current: {journey.current_station_name ?? journey.current_station_code ?? 'Origin'} →
                      Next: {journey.next_station_name ?? journey.next_station_code ?? 'Destination'}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No matching trains" />
        )}
      </Panel>
    </>
  );
}
