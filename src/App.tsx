import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import LandingPage from '@/pages/LandingPage';

// The workspace pulls in three.js; keep it out of the landing bundle.
const AnalyzePage = lazy(() => import('@/pages/AnalyzePage'));
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-base text-xs text-faint">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}
