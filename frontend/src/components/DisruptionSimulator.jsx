import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { useCreateDisruption, useDisruptions } from '../services/queries.js';

export function DisruptionSimulator({ tracks = [], stations = [], onCreated }) {
  const [type, setType] = useState('TRACK_FAILURE');
  const [severity, setSeverity] = useState('HIGH');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [connectedOnly, setConnectedOnly] = useState(true);
  const mutation = useCreateDisruption();
  const disruptions = useDisruptions();
  const occupied = new Set(
    (disruptions.data ?? [])
      .filter((d) => ['OPEN', 'ANALYZING'].includes(d.status))
      .map((d) => d.track_id ?? d.station_id),
  );
  const stationMode = type === 'STATION_CLOSURE';
  const options = useMemo(
    () =>
      stationMode
        ? stations.filter(
            (s) =>
              !connectedOnly ||
              tracks.some(
                (t) => t.from_station_code === s.station_code || t.to_station_code === s.station_code,
              ),
          )
        : tracks.filter((t) => t.status === 'ACTIVE'),
    [stationMode, stations, tracks, connectedOnly],
  );
  useEffect(() => setTarget(''), [stationMode]);
  const submit = async (event) => {
    event.preventDefault();
    try {
      const result = await mutation.mutateAsync({
        type,
        severity,
        description: description || undefined,
        [stationMode ? 'station_id' : 'track_id']: target,
      });
      setDescription('');
      onCreated?.(result.data);
      setTarget('');
    } catch {
      /* The mutation exposes the server error below. */
    }
  };
  return (
    <form className="simulator" onSubmit={submit}>
      <div className="simulator-heading">
        <span className="simulator-icon">
          <AlertTriangle size={19} />
        </span>
        <div>
          <h3>What happened on the railway?</h3>
          <p>Choose a location. We’ll find affected trains and search for a diversion.</p>
        </div>
      </div>
      <label>
        Event type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="TRACK_FAILURE">Track failure</option>
          <option value="MAINTENANCE">Maintenance block</option>
          <option value="ROUTE_BLOCKAGE">Route blockage</option>
          <option value="ACCIDENT">Accident</option>
          <option value="STATION_CLOSURE">Station closure</option>
        </select>
      </label>
      {stationMode && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={connectedOnly}
            onChange={(e) => {
              setConnectedOnly(e.target.checked);
              setTarget('');
            }}
          />
          Show only stations connected to this railway network
        </label>
      )}
      <label>
        {stationMode ? 'Station' : 'Track segment'}
        <select required value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select {stationMode ? 'station' : 'segment'}…</option>
          {options.map((item) => (
            <option
              disabled={occupied.has(stationMode ? item.id : item.track_id)}
              value={stationMode ? item.id : item.track_id}
              key={stationMode ? item.id : item.track_id}
            >
              {stationMode
                ? `${item.station_code} · ${item.name}`
                : `${item.from_station_code} → ${item.to_station_code}`}
              {occupied.has(stationMode ? item.id : item.track_id) ? ' · already disrupted' : ''}
            </option>
          ))}
        </select>
      </label>
      {target && (
        <div className="scenario-preview">
          <b>{stationMode ? 'This station will close' : 'This track will be disrupted'}</b>
          <p>
            {stationMode
              ? stations.find((s) => s.id === target)?.name
              : (() => {
                  const t = tracks.find((t) => t.track_id === target);
                  return `${stations.find((s) => s.station_code === t?.from_station_code)?.name ?? t?.from_station_code} → ${stations.find((s) => s.station_code === t?.to_station_code)?.name ?? t?.to_station_code}`;
                })()}
          </p>
          <small>
            After submission: check affected journeys → search for alternate paths → review results.
          </small>
        </div>
      )}
      <div className="severity-row">
        <span>Severity</span>
        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
          <button
            type="button"
            key={value}
            className={severity === value ? 'active' : ''}
            onClick={() => setSeverity(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <label>
        Operator note
        <textarea
          value={description}
          maxLength={2000}
          placeholder="Optional context for the control room"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {mutation.isError && <p className="form-error">{mutation.error.message}</p>}
      {mutation.isSuccess && (
        <p className="form-success" role="status">
          Event recorded. Follow the analysis in the incident workspace.
        </p>
      )}
      <p className="form-hint">
        This changes the connected demo database. Some locations have no active journeys; the result will
        explain when no trains are affected.
      </p>
      <button className="button primary" disabled={!target || mutation.isPending}>
        {mutation.isPending ? (
          'Creating…'
        ) : (
          <>
            <Send size={16} />
            Simulate & analyse
          </>
        )}
      </button>
    </form>
  );
}
