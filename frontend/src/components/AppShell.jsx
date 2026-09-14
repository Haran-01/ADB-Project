import { Activity, AlertTriangle, Clock3, Gauge, Menu, Radio, TrainFront, X, CircleHelp } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useHealth } from '../services/queries.js';
import { useRealtime } from '../services/realtime.jsx';

const links = [
  { to: '/', label: 'Operations', icon: Gauge },
  { to: '/disruptions', label: 'Disruptions', icon: AlertTriangle },
  { to: '/trains', label: 'Trains', icon: TrainFront },
  { to: '/history', label: 'Event history', icon: Clock3 },
  { to: '/help', label: 'How it works', icon: CircleHelp },
];
const titles = {
  '/': 'Network operations',
  '/disruptions': 'Disruption control',
  '/trains': 'Active fleet',
  '/history': 'Event history',
  '/help': 'Your operator guide',
};
export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const health = useHealth();
  const realtime = useRealtime();
  useEffect(() => {
    setOpen(false);
    if (!hash) window.scrollTo(0, 0);
    else {
      const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
      return () => cancelAnimationFrame(frame);
    }
  }, [pathname, hash]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
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
            <span>{realtime.connected ? 'Updates connected' : 'Reconnecting'}</span>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      <nav className="mobile-navigation" aria-label="Main navigation">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={19} />
            <span>{label === 'Event history' ? 'Activity' : label === 'How it works' ? 'Guide' : label}</span>
          </NavLink>
        ))}
      </nav>
      {open && (
        <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />
      )}
    </div>
  );
}
