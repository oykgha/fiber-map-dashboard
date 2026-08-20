
import { lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { SearchSubmenu } from './components/SearchSubmenu';
import { KmzFilesPanel } from './components/KmzFilesPanel';
import { FiberMap } from './components/FiberMap';
import { StatCards } from './components/StatCards';
import { AlertToast } from './components/AlertToast';
import { ActiveRouteBanner } from './components/ActiveRouteBanner';
import { MapSelectionBanner } from './components/MapSelectionBanner';

import { useAppStore } from './store/useAppStore';

// These are all only-render-when-opened modals/drawers — lazy-loading them
// keeps their JS (XccPanel and FiberSegmentModal alone are 1300+ and 800+
// lines) out of the initial bundle, only fetched the first time a user
// actually opens one.
const AlertDrawer = lazy(() => import('./components/AlertDrawer').then(m => ({ default: m.AlertDrawer })));
const XccPanel = lazy(() => import('./components/XccPanel').then(m => ({ default: m.XccPanel })));
const FiberSegmentModal = lazy(() => import('./components/FiberSegmentModal').then(m => ({ default: m.FiberSegmentModal })));
const RouteBuilderModal = lazy(() => import('./components/RouteBuilderModal').then(m => ({ default: m.RouteBuilderModal })));

function App() {
  const { theme } = useAppStore();

  return (
    <div className={`relative w-screen h-screen overflow-hidden bg-background text-text-primary ${theme}`}>
      {/* Background Map Layer */}
      <FiberMap />

      {/* Floating UI Elements */}
      <Sidebar />
      <SearchSubmenu />
      <KmzFilesPanel />
      <StatCards />
      <AlertToast />

      {/* Alert Details Drawer & Modals */}
      <Suspense fallback={null}>
        <AlertDrawer />
        <XccPanel />
        <FiberSegmentModal />
        <RouteBuilderModal />
      </Suspense>
      <ActiveRouteBanner />
      <MapSelectionBanner />
    </div>
  );
}

export default App;
