import { Activity, AlertTriangle, Clock3, Gauge, Menu, Radio, TrainFront, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useHealth } from '../services/queries.js';
import { useRealtime } from '../services/realtime.jsx';

const links = [
  { to: '/', label: 'Operations', icon: Gauge },
  { to: '/disruptions', label: 'Disruptions', icon: AlertTriangle },
  { to: '/trains', label: 'Trains', icon: TrainFront },
  { to: '/history', label: 'Event history', icon: Clock3 },
];
const titles = {
  '/': 'Network operations',
  '/disruptions': 'Disruption control',
  '/trains': 'Active fleet',
  '/history': 'Event history',
};
export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const health = useHealth();
  const realtime = useRealtime();
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <TrainFront size={22} />
          </span>
          <span>
            <b>RailOps</b>
            <small>Southern control</small>
          </span>
        </div>
        <button
          className="icon-button sidebar-close"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="eyebrow">System status</span>
          <div className="status-row">
            <span className={`pulse ${health.isSuccess ? 'online' : 'offline'}`} />
            {health.isSuccess ? 'API operational' : 'API unavailable'}
          </div>
          <div className="status-row">
            <Radio size={15} />
            {realtime.connected ? 'Live stream connected' : 'Reconnecting live stream'}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div>
            <span className="eyebrow">Intelligent railway network</span>
            <h1>{titles[pathname] ?? 'RailOps'}</h1>
          </div>
          <div className="topbar-state">
            <Activity size={17} />
            <span>{realtime.connected ? 'Live' : 'Snapshot'}</span>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      {open && (
        <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />
      )}
    </div>
  );
}
