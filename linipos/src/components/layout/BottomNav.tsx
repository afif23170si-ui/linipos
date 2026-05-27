import { Home, Package, BarChart3, Settings, ShoppingCart, History, UserCircle } from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';

// Owner nav: Beranda, Produk, Kasir (CTA), Laporan, Pengaturan
const ownerNavItems = [
  { to: '/', icon: Home, label: 'Beranda', isCta: false, matchPaths: ['/'] },
  { to: '/products', icon: Package, label: 'Produk', isCta: false, matchPaths: ['/products'] },
  { to: '/cashier', icon: ShoppingCart, label: 'Kasir', isCta: true, matchPaths: ['/cashier'] },
  // Laporan maps to /reports but also active for /history and /shifts
  { to: '/reports', icon: BarChart3, label: 'Laporan', isCta: false, matchPaths: ['/reports', '/history', '/shifts'] },
  { to: '/settings', icon: Settings, label: 'Pengaturan', isCta: false, matchPaths: ['/settings'] },
];

// Kasir nav: Produk, Kasir (CTA), Riwayat
const kasirNavItems = [
  { to: '/products', icon: Package, label: 'Produk', isCta: false, matchPaths: ['/products'] },
  { to: '/cashier', icon: ShoppingCart, label: 'Kasir', isCta: true, matchPaths: ['/cashier'] },
  { to: '/history', icon: History, label: 'Riwayat', isCta: false, matchPaths: ['/history'] },
];

export default function BottomNav() {
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect kasir away from owner-only/dashboard/profile routes
  useEffect(() => {
    const ownerOnlyRoutes = ['/reports', '/shifts', '/supplier', '/stock-in', '/stock-out', '/stock-report', '/settings'];
    if (!isOwner) {
      if (location.pathname === '/' || ownerOnlyRoutes.some(r => location.pathname.startsWith(r))) {
        navigate('/cashier', { replace: true });
      }
    }
  }, [isOwner, location.pathname, navigate]);

  // Pick nav set based on role
  const navItems = isOwner ? ownerNavItems : kasirNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end justify-around h-16 max-w-lg md:max-w-6xl mx-auto px-2 md:px-4">
        {navItems.map(({ to, icon: Icon, label, isCta, matchPaths }) => {
          // Compute active manually based on matchPaths
          const isActive = to === '/'
            ? location.pathname === '/'
            : matchPaths.some(p => location.pathname.startsWith(p));

          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={cn(
                'flex flex-col items-center gap-0.5 transition-colors min-w-[52px]',
                isCta
                  ? 'relative -top-4'
                  : cn(
                      'px-2 py-1.5 rounded-xl',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )
              )}
            >
              {isCta ? (
                <>
                  <div className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95',
                    'bg-primary text-primary-foreground',
                    isActive && 'ring-4 ring-primary/20'
                  )}>
                    <Icon className="w-6 h-6" strokeWidth={2.5} />
                  </div>
                  <span className={cn(
                    'text-[10px] font-bold leading-tight mt-0.5',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>{label}</span>
                </>
              ) : (
                <>
                  <div className={cn(
                    'flex items-center justify-center w-10 h-7 rounded-full transition-colors',
                    isActive && 'bg-primary/10'
                  )}>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="text-[10px] font-semibold leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
