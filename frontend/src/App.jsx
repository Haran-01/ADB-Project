import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RealtimeProvider } from './services/realtime.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoadingState } from './components/UI.jsx';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })),
);
const DisruptionsPage = lazy(() =>
  import('./pages/DisruptionsPage.jsx').then((module) => ({ default: module.DisruptionsPage })),
);
const TrainsPage = lazy(() =>
  import('./pages/TrainsPage.jsx').then((module) => ({ default: module.TrainsPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage.jsx').then((module) => ({ default: module.HistoryPage })),
);
const HelpPage = lazy(() => import('./pages/HelpPage.jsx'));

export function App() {
  return (
    <RealtimeProvider>
      <Suspense fallback={<LoadingState label="Opening control room" />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="disruptions" element={<DisruptionsPage />} />
            <Route path="trains" element={<TrainsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </RealtimeProvider>
  );
}
