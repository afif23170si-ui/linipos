import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDefaultData } from '@/lib/db';
import { useEffect, useRef, useState } from 'react';
import SideNav from './SideNav';
import { useThemeColor } from '@/hooks/use-theme-color';
import Onboarding from '@/components/Onboarding';
import PinLogin from '@/components/PinLogin';
import SetupOwnerPin from '@/components/SetupOwnerPin';
import { useAuth } from '@/lib/auth-context';
import { Bell, Menu, ShoppingCart, Wifi, WifiOff, X, Maximize, Minimize, Monitor, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasJwt, bootstrapStoreIdFromJwt } from '@/lib/api-client';
import { useSocket } from '@/hooks/use-socket';

// ── App Scale / Zoom Constants ──────────────────────────────────────────────
const ZOOM_LEVELS = [80, 90, 100, 110, 125, 140];
const ZOOM_KEY = 'linipos-zoom';

// ── Realtime clock helpers ──────────────────────────────────────────────────
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatDateCompact(d: Date) {
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
}
function formatDateFull(d: Date) {
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/cashier': 'Kasir',
  '/products': 'Produk',
  '/categories': 'Kategori Produk',
  '/reports': 'Analitik Penjualan',
  '/history': 'Riwayat Transaksi',
  '/shifts': 'Riwayat Shift',
  '/settings': 'Pengaturan',
  '/supplier': 'Supplier',
  '/stock-in': 'Stok Masuk',
  '/stock-out': 'Stok Keluar',
  '/stock-report': 'Laporan Stok',
};

const SIDEBAR_KEY = 'linipos-sidebar-expanded';

export default function AppLayout() {
  useThemeColor();
  const location = useLocation();
  const navigate = useNavigate();

  // WebSocket untuk realtime sync — reactive terhadap JWT
  const [jwtAvailable, setJwtAvailable] = useState(() => hasJwt());
  const { isConnected } = useSocket(jwtAvailable);

  // Update jwtAvailable kalau JWT berubah (login/logout)
  useEffect(() => {
    const interval = setInterval(() => {
      const has = hasJwt();
      setJwtAvailable(prev => prev !== has ? has : prev);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Realtime clock ─────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Notification panel ─────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  // ── Zoom & Screen Controls ──────────────────────────────────────────────────
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(ZOOM_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        if (ZOOM_LEVELS.includes(val)) return val;
      }
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
    return 100;
  });

  useEffect(() => {
    // Terapkan zoom skala ke dokumen HTML
    (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = `${zoom}%`;
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  }, [zoom]);

  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleZoomIn = () => {
    const currIdx = ZOOM_LEVELS.indexOf(zoom);
    if (currIdx !== -1 && currIdx < ZOOM_LEVELS.length - 1) {
      setZoom(ZOOM_LEVELS[currIdx + 1]);
    }
  };

  const handleZoomOut = () => {
    const currIdx = ZOOM_LEVELS.indexOf(zoom);
    if (currIdx !== -1 && currIdx > 0) {
      setZoom(ZOOM_LEVELS[currIdx - 1]);
    }
  };

  const [screenOpen, setScreenOpen] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!screenOpen) return;
    const handler = (e: MouseEvent) => {
      if (screenRef.current && !screenRef.current.contains(e.target as Node)) {
        setScreenOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [screenOpen]);

  // Mobile drawer state
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop expanded/collapsed — persisted to localStorage (defaults to collapsed/false)
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true'; } catch { return false; }
  });

  const toggleSidebar = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  };

  useEffect(() => { seedDefaultData(); }, []);

  // Bootstrap serverStoreId dari JWT yang sudah ada — fix untuk device lama yang upgrade
  useEffect(() => {
    bootstrapStoreIdFromJwt().catch(() => {});
  }, []);

  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());
  const userCount = useLiveQuery(() => db.users.count());
  const { isLoggedIn, currentUser } = useAuth();

  if (storeSettings === undefined || userCount === undefined) return null;

  // Device baru: tidak ada data lokal DAN tidak ada JWT → tampilkan pilihan
  if (!storeSettings || !storeSettings.onboardingDone) {
    if (!hasJwt()) {
      // Redirect ke /auth (AuthChoice) — tapi hanya kalau bukan sudah di /auth, /register, /login
      const authPaths = ['/auth', '/register', '/login'];
      if (!authPaths.includes(location.pathname)) {
        navigate('/auth', { replace: true });
        return null;
      }
      return null; // biarkan route /auth, /register, /login render
    }
    // Punya JWT tapi belum setup toko → Onboarding
    return <Onboarding onComplete={() => {}} />;
  }
  if (userCount === 0) {
    return <SetupOwnerPin onComplete={() => {}} />;
  }
  if (!isLoggedIn) return <PinLogin />;

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Lini POS';
  const isCashier = location.pathname === '/cashier';

  // Sidebar width for desktop margin
  const sidebarW = expanded ? 'lg:ml-64' : 'lg:ml-[68px]';

  return (
    <div className="min-h-dvh bg-background overflow-x-hidden">

      {/* ── SIDEBAR ── */}
      <SideNav
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        expanded={expanded}
        storeSettings={storeSettings}
        onToggleSidebar={toggleSidebar}
      />

      {/* ── MAIN CONTENT ── */}
      <div className={cn(
        'flex flex-col min-h-dvh transition-all duration-300',
        sidebarW
      )}>

        {/* ── TOP HEADER ── */}
        <header className={cn(
          'fixed top-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border h-14 flex items-center px-3 gap-2 transition-all duration-300',
          expanded ? 'lg:left-64' : 'lg:left-[68px]',
          'left-0'
        )}>

          {/* Burger — mobile only */}
          <button
            onClick={() => {
              if (window.innerWidth < 1024) { setMobileOpen(v => !v); }
              else { toggleSidebar(); }
            }}
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Menu"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Realtime Date ── */}
          <div className="flex items-center gap-1.5 shrink-0 select-none" title={formatDateFull(now)}>
            {/* compact on mobile, full on sm+ */}
            <span className="sm:hidden text-[11px] font-semibold text-muted-foreground leading-none">
              {formatDateCompact(now)}
            </span>
            <span className="hidden sm:inline text-xs font-semibold text-muted-foreground leading-none">
              {formatDateFull(now)}
            </span>
          </div>

          {/* Thin divider */}
          <div className="hidden sm:block w-px h-5 bg-border/60 shrink-0" />

          {/* ── Kasir shortcut ── */}
          {!isCashier && (
            <NavLink
              to="/cashier"
              className="hidden sm:flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:shadow-md hover:shadow-primary/10 hover:bg-primary/95 active:scale-95 transition-all flex-shrink-0"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Kasir
            </NavLink>
          )}

          {/* ── Realtime connection indicator ── */}
          {jwtAvailable && (
            <div
              className={cn(
                'flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[10px] font-bold shrink-0 border transition-all',
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-sm shadow-emerald-500/5'
                  : 'bg-muted text-muted-foreground border-border/40'
              )}
              title={isConnected ? 'Terhubung realtime' : 'Tidak terhubung'}
            >
              {isConnected
                ? <Wifi className="w-3.5 h-3.5" />
                : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          )}

          {/* ── Notification Bell ── */}
          <div className="relative shrink-0" ref={notifRef}>
            <button
              id="notif-bell-btn"
              onClick={() => setNotifOpen(v => !v)}
              className={cn(
                'relative w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                notifOpen
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              aria-label="Notifikasi"
            >
              <Bell className="w-[17px] h-[17px]" />
            </button>

            {/* ── Notification popup ── */}
            {notifOpen && (
              <div
                id="notif-popup"
                className={cn(
                  'absolute right-0 top-[calc(100%+8px)] z-50',
                  'w-[300px] sm:w-[340px]',
                  'bg-card border border-border/50 rounded-2xl shadow-xl shadow-black/10',
                  'overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150'
                )}
              >
                {/* Header popup */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold text-foreground">Notifikasi</span>
                  </div>
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Tutup"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Empty state */}
                <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-muted/60 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center leading-relaxed">
                    Belum ada notifikasi<br />saat ini.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Screen & Zoom Controls ── */}
          <div className="relative shrink-0" ref={screenRef}>
            <button
              onClick={() => setScreenOpen(v => !v)}
              className={cn(
                'relative w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                screenOpen
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              title="Kontrol Tampilan"
              aria-label="Kontrol Tampilan"
            >
              <Monitor className="w-[17px] h-[17px]" />
            </button>

            {screenOpen && (
              <div
                className={cn(
                  'absolute right-0 top-[calc(100%+8px)] z-50',
                  'w-[260px]',
                  'bg-card border border-border/50 rounded-2xl shadow-xl shadow-black/10',
                  'p-4 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150 text-left'
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold text-foreground">Kontrol Tampilan</span>
                  </div>
                  <button
                    onClick={() => setScreenOpen(false)}
                    className="w-5 h-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Zoom Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground">Skala Zoom</span>
                    <button
                      onClick={() => setZoom(100)}
                      disabled={zoom === 100}
                      className="text-[10px] font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      Reset (100%)
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-muted/40 border border-border/30 rounded-xl p-1.5">
                    <button
                      onClick={handleZoomOut}
                      disabled={zoom === ZOOM_LEVELS[0]}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-foreground tabular-nums min-w-[48px] text-center select-none">
                      {zoom}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Fullscreen Section */}
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <span className="text-[11px] font-bold text-muted-foreground block">Mode Layar</span>
                  <button
                    onClick={toggleFullscreen}
                    className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 active:scale-[0.98] text-xs font-semibold transition-all"
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Keluar Layar Penuh</span>
                      </>
                    ) : (
                      <>
                        <Maximize className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Layar Penuh (Fullscreen)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <main className={cn("flex-1 pt-14", !isCashier && "pb-8")}>
          <Outlet />
        </main>
      </div>

      {/* ── KASIR FAB (mobile only, hidden when already on /cashier) ── */}
      {!isCashier && (
        <NavLink
          to="/cashier"
          className="fixed z-40 sm:hidden flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 active:scale-95 transition-transform"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))', right: '1rem' }}
          aria-label="Buka Kasir"
        >
          <ShoppingCart className="w-6 h-6" strokeWidth={2.5} />
        </NavLink>
      )}
    </div>
  );
}
