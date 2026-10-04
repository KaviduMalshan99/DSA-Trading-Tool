import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Toolbar } from './components/UI/Toolbar';
import { StatusBar } from './components/UI/StatusBar';
import { SymbolList } from './components/Sidebar/SymbolList';
import { MarketInfo } from './components/Sidebar/MarketInfo';
import { SidebarRail } from './components/Sidebar/SidebarRail';
import { ChartContainer } from './components/Chart/ChartContainer';
import { WhaleTicker } from './components/Overlay/WhaleTicker';
import { DOMPanel } from './components/Overlay/DOMPanel';
import { TapePanel } from './components/Overlay/TapePanel';
import { AlertsEngine } from './components/UI/AlertsEngine';
import { ToastStack } from './components/UI/ToastStack';
import { AuthModal } from './components/Auth/AuthModal';
import { ProfileModal } from './components/Auth/ProfileModal';
import { useChartStore } from './store/chartStore';
import { useAuthStore, takeSessionExpiredNotice } from './store/authStore';
import { start as startSync } from './services/sync';
import { SHOW_DOM_PANEL, SHOW_TAPE_PANEL } from './config/topBarVisibility';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled.',
  unverified_email: "Your Google email address isn't verified.",
  account_disabled: 'This account is disabled.',
  account_conflict: 'This email is already linked to a different Google account.',
  google_unavailable: "Google sign-in isn't available right now.",
};

function authErrorMessage(code: string): string {
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code)
    ? AUTH_ERROR_MESSAGES[code]
    : 'Google sign-in failed. Please try again.';
}

export default function App() {
  const whaleActive = useChartStore((s) => s.visibleOverlays.has('whaleMarkers'));
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [domOpen, setDomOpen] = useState(false);
  const [tapeOpen, setTapeOpen] = useState(false);

  // Lifted so the header's snapshot button can reach the live chart + its overlays.
  const sharedChartRef  = useRef<IChartApi | null>(null);
  const sharedSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartAreaRef    = useRef<HTMLDivElement>(null);

  // Resolve the cookie session once; the store guards against StrictMode's double effect.
  // The sync engine (same guard) subscribes before init() can resolve, so it sees the
  // session's 'authenticated' transition.
  useEffect(() => {
    startSync();
    void useAuthStore.getState().init();
    // The Google OAuth callback redirects here with ?auth_error=<code> on failure.
    // Stripping the param makes this StrictMode-safe: the second run finds nothing.
    const url = new URL(window.location.href);
    const code = url.searchParams.get('auth_error');
    if (code !== null) {
      useAuthStore.getState().openAuthModal('login', authErrorMessage(code));
      url.searchParams.delete('auth_error');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    // The previous page load found the session ended (expired or revoked) and
    // reloaded; the flag is consumed, so StrictMode's second run finds nothing.
    if (takeSessionExpiredNotice()) {
      useAuthStore.getState().openAuthModal('login', 'Your session ended. Please log in again.');
    }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden">
      <Toolbar chartRef={sharedChartRef} chartAreaRef={chartAreaRef} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <ChartContainer
            sharedChartRef={sharedChartRef}
            sharedSeriesRef={sharedSeriesRef}
            chartAreaRef={chartAreaRef}
          />
        </main>
        {watchlistOpen && (
          <aside className="w-52 flex flex-col flex-shrink-0">
            <MarketInfo />
            {/* overflow-hidden + min-h-0 constrains SymbolList so WhaleTicker fits below */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <SymbolList />
            </div>
            {whaleActive && <WhaleTicker />}
          </aside>
        )}
        {SHOW_DOM_PANEL && domOpen && (
          <aside className="w-56 flex flex-col flex-shrink-0 border-l border-[var(--border-color)]">
            <DOMPanel />
          </aside>
        )}
        {SHOW_TAPE_PANEL && tapeOpen && (
          <aside className="w-56 flex flex-col flex-shrink-0 border-l border-[var(--border-color)]">
            <TapePanel />
          </aside>
        )}
        <SidebarRail
          open={watchlistOpen}
          onToggle={() => setWatchlistOpen((v) => !v)}
          domOpen={domOpen}
          onToggleDom={() => setDomOpen((v) => !v)}
          tapeOpen={tapeOpen}
          onToggleTape={() => setTapeOpen((v) => !v)}
        />
      </div>
      <StatusBar />
      {/* Always mounted — alerts must keep firing regardless of which
          panels/modals are open, so this isn't gated behind any toggle. */}
      <AlertsEngine />
      <ToastStack />
      <AuthModal />
      <ProfileModal />
    </div>
  );
}
