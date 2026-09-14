import { AlertCircle, Inbox, LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Panel({ title, eyebrow, action, className = '', children }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function StatusPill({ value }) {
  const tone = /ACTIVE|RUNNING|COMPLETED|PROCESSED|APPLIED/.test(value)
    ? 'good'
    : /FAILED|CRITICAL|CANCELLED|BLOCKED/.test(value)
      ? 'bad'
      : /OPEN|DELAYED|ANALYZING|HIGH|PENDING|WAITING/.test(value)
        ? 'warn'
        : 'neutral';
  return <span className={`status-pill ${tone}`}>{String(value).replaceAll('_', ' ')}</span>;
}
export function LoadingState({ label = 'Loading operational data' }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="state" role="status" aria-live="polite">
      <LoaderCircle className="spin" />
      <p>{label}</p>
      <p className="loading-copy" key={Math.floor(elapsed / 4)}>
        {elapsed < 4
          ? 'Requesting the latest saved data…'
          : elapsed < 12
            ? 'Waiting for the backend response…'
            : 'This is taking longer than usual. Still waiting for the service…'}
      </p>
    </div>
  );
}
export function EmptyState({ title = 'No records', message = 'Nothing needs attention right now.' }) {
  return (
    <div className="state">
      <Inbox />
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
export function ErrorState({ error, onRetry }) {
  return (
    <div className="state error-state">
      <AlertCircle />
      <strong>Unable to load data</strong>
      <p>{error?.message ?? 'The service did not respond.'}</p>
      {onRetry && (
        <button className="button secondary" onClick={onRetry}>
          <RotateCcw size={15} />
          Retry
        </button>
      )}
    </div>
  );
}
export const formatTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';
export const formatMinutes = (value) => `${Number(value ?? 0)} min`;
