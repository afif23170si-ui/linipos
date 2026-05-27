import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, ShoppingCart, Package, Settings, History,
  UserCircle, X, LogOut, ChevronRight, ChevronLeft,
  Receipt, Clock, Truck, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, Tag, HelpCircle, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db, type StoreSettings, type User } from '@/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Key } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

type IconType = LucideIcon;

interface NavLinkItem {
  type: 'link';
  to: string;
  icon: IconType;
  label: string;
  end?: boolean;
  matchPaths?: string[];
  disabled?: boolean;
  badge?: string;
}

interface NavHeader {
  type: 'header';
  label: string;
}

type NavEntry = NavLinkItem | NavHeader;

const ownerNav: NavEntry[] = [
  { type: 'link', to: '/', icon: Home, label: 'Dashboard', end: true },
  { type: 'link', to: '/cashier', icon: ShoppingCart, label: 'Kasir' },
  
  { type: 'header', label: 'Produk & Stok' },
  { type: 'link', to: '/products', icon: Package, label: 'Daftar Produk', end: true, matchPaths: ['/products'] },
  { type: 'link', to: '/categories', icon: Tag, label: 'Kategori Produk', matchPaths: ['/categories'] },
  
  { type: 'header', label: 'Laporan' },
  { type: 'link', to: '/reports', icon: TrendingUp, label: 'Analitik Penjualan', end: true, matchPaths: ['/reports'] },
  { type: 'link', to: '/history', icon: Receipt, label: 'Riwayat Transaksi', matchPaths: ['/history'] },
  { type: 'link', to: '/shifts', icon: Clock, label: 'Riwayat Shift', matchPaths: ['/shifts'] },
  
  { type: 'header', label: 'Inventori' },
  { type: 'link', to: '/supplier', icon: Truck, label: 'Supplier', matchPaths: ['/supplier'] },
  { type: 'link', to: '/stock-in', icon: ArrowDownToLine, label: 'Stock In', matchPaths: ['/stock-in'] },
  { type: 'link', to: '/stock-out', icon: ArrowUpFromLine, label: 'Stock Out', matchPaths: ['/stock-out'] },
  { type: 'link', to: '/stock-report', icon: Package, label: 'Laporan Stok', matchPaths: ['/stock-report'] },
  
  { type: 'header', label: 'Pengaturan' },
  { type: 'link', to: '/settings', icon: Settings, label: 'Pengaturan' },
  { type: 'link', to: '#', icon: HelpCircle, label: 'Help Center', disabled: true, badge: 'Segera' },
  { type: 'link', to: '#', icon: MessageSquare, label: 'Feedback', disabled: true, badge: 'Segera' },
];

const kasirNav: NavEntry[] = [
  { type: 'link', to: '/cashier', icon: ShoppingCart, label: 'Kasir' },
  { type: 'link', to: '/products', icon: Package, label: 'Produk' },
  { type: 'link', to: '/history', icon: History, label: 'Riwayat' },
];

export interface SideNavProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  expanded: boolean;
  storeSettings?: StoreSettings;
  onToggleSidebar?: () => void;
}

export default function SideNav({ mobileOpen, onMobileClose, expanded, storeSettings, onToggleSidebar }: SideNavProps) {
  const { isOwner, currentUser, logout, loginAsUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = isOwner ? ownerNav : kasirNav;

  const [switchDialogOpen, setSwitchDialogOpen] = useState(false);
  const [selectedUserForPin, setSelectedUserForPin] = useState<User | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const users = useLiveQuery(() => db.users.filter(u => u.isActive).toArray());

  const handleKeypadPress = async (num: string) => {
    setErrorMsg('');
    if (enteredPin.length >= 4) return;
    const newPin = enteredPin + num;
    setEnteredPin(newPin);
    if (newPin.length === 4) {
      if (!selectedUserForPin) return;
      try {
        const res = await loginAsUser(selectedUserForPin.id!, newPin);
        if (res.success) {
          toast.success(`Berhasil berpindah ke akun ${selectedUserForPin.name}`);
          setSwitchDialogOpen(false);
          setSelectedUserForPin(null);
          setEnteredPin('');
          navigate('/', { replace: true });
        } else {
          setErrorMsg(res.error || 'PIN salah');
          setEnteredPin('');
        }
      } catch {
        setErrorMsg('Gagal berpindah akun');
        setEnteredPin('');
      }
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setEnteredPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    const ownerOnlyRoutes = ['/reports', '/shifts', '/supplier', '/stock-in', '/stock-out', '/stock-report', '/categories', '/settings'];
    if (!isOwner) {
      if (location.pathname === '/' || ownerOnlyRoutes.some(r => location.pathname.startsWith(r))) {
        navigate('/cashier', { replace: true });
      }
    }
  }, [isOwner, location.pathname, navigate]);

  // Close mobile drawer on route change
  useEffect(() => { onMobileClose(); }, [location.pathname, onMobileClose]);

  const handleLogout = () => { onMobileClose(); logout(); };

  const isLinkActive = (item: NavLinkItem) => {
    if (item.end) return location.pathname === item.to.split('?')[0];
    const matchPaths = item.matchPaths ?? [item.to];
    return matchPaths.some(p => location.pathname.startsWith(p));
  };

  return (
    <TooltipProvider delayDuration={100}>
      {/* ── MOBILE BACKDROP ── */}
      <div
        onClick={onMobileClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* ── SIDEBAR PANEL ── */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-50 bg-card border-r border-border flex flex-col',
          'transition-all duration-300 ease-in-out shadow-xl lg:shadow-none',
          // Mobile: full-width drawer, hidden off-screen when closed. Desktop: overflow visible for collapsed tooltip
          'w-72 overflow-x-hidden lg:overflow-x-visible',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          expanded ? 'lg:w-64' : 'lg:w-[68px]'
        )}
      >
        {/* Desktop Toggle Button overlapping sidebar vertical border */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="hidden lg:flex absolute top-4 right-0 translate-x-1/2 z-50 w-6 h-6 rounded-lg bg-card border border-border items-center justify-center text-muted-foreground hover:text-foreground shadow-sm hover:shadow hover:bg-muted active:scale-95 transition-all cursor-pointer"
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded ? (
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            )}
          </button>
        )}

        {/* ── HEADER ── */}
        <div className={cn(
          'h-14 border-b border-border transition-all duration-300 flex-shrink-0 flex items-center gap-3',
          expanded ? 'px-4' : 'lg:px-0 lg:justify-center px-4'
        )}>
          <img
            src={storeSettings?.logo || '/logolini.png'}
            alt="Logo"
            className="w-9 h-9 rounded-xl object-cover flex-shrink-0"
          />
          <div className={cn('flex-1 min-w-0 transition-all duration-200', !expanded && 'lg:hidden')}>
            <p className="font-bold text-sm leading-tight truncate">
              {storeSettings?.storeName || 'Lini POS'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {isOwner ? '👑 Owner' : '🧑‍💼 Kasir'} · {currentUser?.name}
            </p>
          </div>
          <button
            onClick={onMobileClose}
            className="lg:hidden w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── NAV ITEMS ── */}
        <nav className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-0.5 transition-all duration-300',
          expanded ? 'px-2' : 'lg:px-1.5 px-2'
        )}>
          {navItems.map((entry, index) => {
            if (entry.type === 'header') {
              return (
                <div key={`header-group-${index}`}>
                  <div
                    className={cn(
                      "text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] px-3 pt-5 pb-1 select-none transition-all duration-300",
                      !expanded && "lg:hidden"
                    )}
                  >
                    {entry.label}
                  </div>
                  {!expanded && (
                    <div
                      className="border-t border-border/40 my-3 mx-1.5 transition-all duration-300 hidden lg:block"
                    />
                  )}
                </div>
              );
            }

            const active = !entry.disabled && isLinkActive(entry);
            const tooltipText = entry.disabled && entry.badge 
              ? `${entry.label} (${entry.badge})` 
              : entry.label;

            if (entry.disabled) {
              const disabledEl = (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-xl text-sm font-medium transition-all group relative',
                    'px-3 py-2.5 my-[1px] opacity-40 cursor-not-allowed text-muted-foreground select-none',
                    !expanded && 'lg:justify-center lg:px-0 lg:py-2.5 lg:w-full'
                  )}
                >
                  <entry.icon
                    className="w-[18px] h-[18px] flex-shrink-0"
                    strokeWidth={2}
                  />
                  <span className={cn('flex-1 whitespace-nowrap transition-all duration-200 text-left', !expanded && 'lg:hidden')}>
                    {entry.label}
                  </span>
                  {entry.badge && expanded && (
                    <span className="text-[9px] font-bold tracking-wider uppercase bg-muted text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-md ml-auto shrink-0 select-none">
                      {entry.badge}
                    </span>
                  )}
                </div>
              );

              if (!expanded) {
                return (
                  <Tooltip key={entry.label} delayDuration={100}>
                    <TooltipTrigger asChild>
                      {disabledEl}
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-bold text-xs rounded-xl shadow-md ml-2 px-2.5 py-1.5 bg-popover text-popover-foreground border border-border">
                      {tooltipText}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return disabledEl;
            }

            const activeEl = (
              <NavLink
                to={entry.to}
                end={entry.end}
                className={cn(
                  'flex items-center gap-3 rounded-xl text-sm font-medium transition-all group relative',
                  'px-3 py-2.5 my-[1px]',
                  !expanded && 'lg:justify-center lg:px-0 lg:py-2.5 lg:w-full',
                  active
                    ? 'bg-primary/10 text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <entry.icon
                  className={cn(
                    'w-[18px] h-[18px] flex-shrink-0 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className={cn('flex-1 whitespace-nowrap transition-all duration-200', !expanded && 'lg:hidden')}>
                  {entry.label}
                </span>
                {active && expanded && (
                  <ChevronRight className="w-3.5 h-3.5 opacity-55 hidden lg:block" />
                )}
              </NavLink>
            );

            if (!expanded) {
              return (
                <Tooltip key={entry.to} delayDuration={100}>
                  <TooltipTrigger asChild>
                    {activeEl}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-bold text-xs rounded-xl shadow-md ml-2 px-2.5 py-1.5 bg-popover text-popover-foreground border border-border">
                    {entry.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return activeEl;
          })}
        </nav>

        {/* ── FOOTER ── */}
        <div className={cn(
          'border-t border-border pt-3 flex-shrink-0',
          expanded ? 'px-3' : 'lg:px-2 px-3',
          'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]' // Safe area padding for mobile home indicator
        )}>
          {/* Expanded Footer (Visible when expanded on desktop, or always on mobile) */}
          <div 
            onClick={() => { setSwitchDialogOpen(true); setSelectedUserForPin(null); setEnteredPin(''); setErrorMsg(''); }}
            className={cn(
              "items-center gap-3 bg-muted/40 border border-border/40 p-2.5 rounded-2xl hover:bg-muted/70 transition-all duration-200 group cursor-pointer shadow-sm",
              expanded ? "flex" : "flex lg:hidden"
            )}
          >
            {/* User Avatar */}
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center shrink-0 shadow-md shadow-primary/20 border border-white/10 transition-transform group-hover:scale-105">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            
            {/* User Info */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs text-foreground truncate leading-snug">
                {currentUser?.name || 'User'}
              </p>
              <p className="text-[10px] text-muted-foreground font-semibold mt-0.5 leading-none">
                {isOwner ? '👑 Owner' : '🧑‍💼 Staf Kasir'}
              </p>
            </div>

            {/* Action Indicator */}
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Collapsed Footer (Visible only when collapsed on desktop, hidden on mobile) */}
          {!expanded && (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setSwitchDialogOpen(true); setSelectedUserForPin(null); setEnteredPin(''); setErrorMsg(''); }}
                  className="group relative items-center justify-center w-full h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer hidden lg:flex"
                >
                  {/* User Avatar Collapsed */}
                  <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center shrink-0 shadow-md shadow-primary/20 border border-white/10 transition-transform group-hover:scale-110">
                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-bold text-xs rounded-xl shadow-md ml-2 px-2.5 py-1.5 bg-popover text-popover-foreground border border-border">
                Ganti Akun / Logout ({currentUser?.name})
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>

      {/* ── SWITCH ACCOUNT DIALOG ── */}
      <Dialog open={switchDialogOpen} onOpenChange={(open) => { setSwitchDialogOpen(open); if (!open) { setSelectedUserForPin(null); setEnteredPin(''); setErrorMsg(''); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-3xl p-5 overflow-hidden">
          {selectedUserForPin === null ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-base font-bold flex items-center gap-2">
                  <UserCircle className="w-5 h-5 text-primary" />
                  Ganti Akun Pengguna
                </DialogTitle>
                <DialogDescription className="text-left text-xs text-muted-foreground mt-1">
                  Pilih akun di bawah untuk berpindah sesi kasir/owner secara instan.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                {users?.map(user => {
                  const isCurrent = user.id === currentUser?.id;
                  return (
                    <button
                      key={user.id}
                      onClick={() => {
                        if (isCurrent) {
                          toast.info(`Anda sudah berada di sesi ${user.name}`);
                          return;
                        }
                        setSelectedUserForPin(user);
                        setEnteredPin('');
                        setErrorMsg('');
                      }}
                      className={cn(
                        "flex items-center gap-3 w-full p-3 rounded-2xl border transition-all text-left group relative",
                        isCurrent
                          ? "border-primary/20 bg-primary/5 cursor-default"
                          : "border-border/40 hover:border-primary/25 hover:bg-muted/40 active:scale-[0.99]"
                      )}
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center shrink-0 shadow-sm shadow-primary/10 border border-white/10">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{user.name}</p>
                        <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                          {user.role === 'owner' ? '👑 Owner' : '🧑‍💼 Staf Kasir'}
                        </p>
                      </div>
                      {isCurrent ? (
                        <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full shrink-0">
                          Sesi Aktif
                        </span>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-dashed border-border/40 my-3.5" />
              
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full h-11 text-xs font-bold text-destructive border-destructive/25 hover:bg-destructive/10 hover:border-destructive/30 rounded-xl transition-all gap-2"
                  onClick={() => { setSwitchDialogOpen(false); handleLogout(); }}
                >
                  <LogOut className="w-4 h-4" />
                  Keluar dari Sesi saat ini
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-base font-bold flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary animate-pulse" />
                  Masukkan PIN Keamanan
                </DialogTitle>
                <DialogDescription className="text-left text-xs text-muted-foreground mt-1">
                  Ketikkan 4-digit PIN untuk akun <span className="font-bold text-foreground">{selectedUserForPin.name}</span>.
                </DialogDescription>
              </DialogHeader>

              {/* PIN Indicator Dots */}
              <div className="flex justify-center gap-4 my-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-3.5 h-3.5 rounded-full border-2 transition-all duration-150',
                      i < enteredPin.length
                        ? 'bg-primary border-primary scale-110 shadow-sm shadow-primary/30'
                        : 'border-muted-foreground/30 bg-transparent'
                    )}
                  />
                ))}
              </div>

              {errorMsg && (
                <p className="text-center text-xs font-bold text-destructive mb-4 animate-shake">
                  ⚠ {errorMsg}
                </p>
              )}

              {/* Circular Keypad */}
              <div className="max-w-[240px] mx-auto grid grid-cols-3 gap-y-3 gap-x-4 justify-items-center mb-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleKeypadPress(val)}
                    className="w-12 h-12 rounded-full text-base font-bold flex items-center justify-center border border-border/40 hover:bg-muted active:scale-90 hover:border-primary/20 transition-all shadow-sm"
                  >
                    {val}
                  </button>
                ))}
                {/* Cancel button */}
                <button
                  type="button"
                  onClick={() => { setSelectedUserForPin(null); setEnteredPin(''); setErrorMsg(''); }}
                  className="w-12 h-12 rounded-full text-[10px] font-bold flex items-center justify-center text-muted-foreground/80 hover:bg-muted hover:text-foreground active:scale-90 transition-all"
                >
                  Batal
                </button>
                {/* Zero button */}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="w-12 h-12 rounded-full text-base font-bold flex items-center justify-center border border-border/40 hover:bg-muted active:scale-90 hover:border-primary/20 transition-all shadow-sm"
                >
                  0
                </button>
                {/* Backspace button */}
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="w-12 h-12 rounded-full text-[10px] font-bold flex items-center justify-center text-muted-foreground/80 hover:bg-muted hover:text-foreground active:scale-90 transition-all"
                >
                  Hapus
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
