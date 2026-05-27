import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, LogIn, Loader2, Mail, Lock, Store, LineChart, CloudLightning, Download } from 'lucide-react';
import { loginWithEmail, syncFromServer } from '@/lib/api-client';
import { db, seedDefaultData } from '@/lib/db';
import { toast } from 'sonner';
import { applyThemeColor } from '@/hooks/use-theme-color';
import { usePWAInstall } from '@/hooks/use-pwa-install';

export default function Login() {
  const navigate = useNavigate();
  const { canInstall, install } = usePWAInstall();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    applyThemeColor('220'); // default dark theme (Hitam HSL 220)
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Login ke server → dapat JWT
      setSyncStatus('Memverifikasi akun...');
      await loginWithEmail(email.trim(), password);

      // 2. Pull semua data toko dari server ke IndexedDB DULU
      setSyncStatus('Mengambil data toko...');
      await syncFromServer();

      // 3. Seed default data HANYA jika tidak ada dari server (payment methods, dll)
      await seedDefaultData();

      // 4. Update onboardingDone supaya tidak kembali ke AuthChoice
      const settings = await db.storeSettings.toCollection().first();
      if (settings?.id && !settings.onboardingDone) {
        await db.storeSettings.update(settings.id, { onboardingDone: true });
      }

      toast.success('Berhasil masuk! Data toko sudah disinkronisasi.');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login gagal';
      setError(message);
      setSyncStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 min-h-screen bg-cover bg-center bg-no-repeat lg:bg-none relative text-foreground animate-fade-in"
         style={{ backgroundImage: "url('/auth-bg.webp')" }}>
      {/* Background Overlay for Mobile & Tablet only */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] lg:hidden z-0" />

      {/* ── KOLOM KIRI: BRANDING & VISUAL (Hanya Desktop >= lg) ── */}
      <div 
        className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden select-none bg-cover bg-center"
        style={{ backgroundImage: "url('/auth-bg.webp')" }}
      >
        {/* Overlay Gelap Premium & Blur Halus */}
        <div className="absolute inset-0 bg-black/35 z-0" />

        {/* Top Header Logo - Compact & Minimalist */}
        <div 
          className="inline-flex items-center gap-2.5 relative z-10 cursor-pointer"
          onClick={() => navigate('/auth')}
        >
          <img
            src="/logolini.png"
            alt="Lini POS Logo"
            className="w-10 h-10 rounded-xl shadow-md object-cover border border-white/10"
          />
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight text-white">Lini POS</span>
            <span className="text-[9px] font-bold tracking-widest text-primary uppercase border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded-md">
              Kasir
            </span>
          </div>
        </div>

        {/* Center Tagline & Features */}
        <div className="space-y-6 my-auto max-w-md mx-auto w-full relative z-10">
          {/* Tagline */}
          <h2 className="text-2xl font-extrabold tracking-tight text-white leading-snug">
            Satu Aplikasi, Seluruh Kebutuhan Kasir & Manajemen Toko Anda.
          </h2>

          {/* List Fitur Utama (Liquid Glass Style) */}
          <div className="space-y-3.5">
            <div className="flex gap-4 p-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg transition-all hover:bg-white/10 hover:border-white/20">
              <div className="w-10 h-10 rounded-lg bg-primary/20 text-white flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Multi-Store & Tenant</h3>
                <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                  Kelola banyak cabang outlet dan kasir terpisah dalam satu akun dengan aman.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg transition-all hover:bg-white/10 hover:border-white/20">
              <div className="w-10 h-10 rounded-lg bg-primary/20 text-white flex items-center justify-center shrink-0">
                <LineChart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Transaksi Instan & Cepat</h3>
                <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                  Desain kasir yang sangat intuitif, pencarian kilat, & pengelolaan open bill.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg transition-all hover:bg-white/10 hover:border-white/20">
              <div className="w-10 h-10 rounded-lg bg-primary/20 text-white flex items-center justify-center shrink-0">
                <CloudLightning className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Sinkronisasi Real-time</h3>
                <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                  Data otomatis tersinkronisasi ke cloud. Tetap bisa bertransaksi meski offline.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Sisi Kiri */}
        <div className="text-xs text-white/40 text-left relative z-10 flex items-center justify-between w-full">
          <span>&copy; {new Date().getFullYear()} Lini POS. Semua hak dilindungi.</span>
          <span>v1.2.0</span>
        </div>
      </div>

      {/* ── KOLOM KANAN: FORM MASUK (Desktop, Tablet & Mobile) ── */}
      <div className="flex flex-col justify-between items-center p-4 py-8 sm:p-10 lg:p-16 bg-transparent lg:bg-background relative z-10 min-h-screen lg:min-h-0 w-full">
        {/* Top Spacer for Desktop Alignment */}
        <div className="hidden lg:block" />

        {/* Floating Card Container with Liquid Glass effect on Mobile/Tablet, clean & borderless on Desktop */}
        <div className="w-full max-w-md bg-black/45 backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:p-0 lg:shadow-none lg:rounded-none space-y-6 transition-all relative z-10 my-auto">
          {/* Header Mobile (Tampil logo compact saat di mobile) */}
          <div className="flex flex-col items-center gap-3 text-center lg:hidden">
            <img
              src="/logolini.png"
              alt="Lini POS"
              className="w-12 h-12 rounded-xl shadow-md object-cover border border-white/10 lg:border-border cursor-pointer"
              onClick={() => navigate('/auth')}
            />
            <div className="space-y-0.5">
              <h1 className="text-xl font-bold tracking-tight text-white lg:text-foreground">Masuk ke Akun</h1>
              <p className="text-xs text-white/70 lg:text-muted-foreground">Data toko kamu akan otomatis tersinkronisasi</p>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:block space-y-1.5 text-left">
            <h2 className="text-xl font-extrabold tracking-tight">Masuk ke Akun</h2>
            <p className="text-xs text-muted-foreground leading-normal">Masukkan kredensial akun toko Anda untuk memulai</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-white/80 lg:text-foreground/80">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 lg:text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@kamu.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="h-11 pl-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-primary lg:bg-background lg:border-border lg:text-foreground lg:placeholder:text-muted-foreground transition-all text-sm"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-xs font-semibold text-white/80 lg:text-foreground/80">Password</Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 lg:text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password kamu"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="h-11 pl-10 pr-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-primary lg:bg-background lg:border-border lg:text-foreground lg:placeholder:text-muted-foreground transition-all text-sm"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white lg:text-muted-foreground lg:hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(v => !v)}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-xl animate-shake">
                {error}
              </p>
            )}

            {loading && syncStatus && (
              <div className="flex items-center gap-2.5 text-xs text-white/80 lg:text-muted-foreground bg-white/5 lg:bg-muted/40 border border-white/10 lg:border-border px-3 py-2.5 rounded-xl">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
                <span>{syncStatus}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-11 font-semibold rounded-xl gap-2 mt-2 transition-all text-sm active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyinkronkan...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Masuk</span>
                </>
              )}
            </Button>
          </form>

          {/* Footer Auth Switcher */}
          <div className="space-y-4 pt-2 text-center text-xs">
            <p className="text-white/60 lg:text-muted-foreground">
              Belum punya akun?{' '}
              <Link to="/register" className="text-primary font-bold hover:underline transition-all">
                Daftar di sini
              </Link>
            </p>

            {/* Quick Install PWA */}
            {canInstall && (
              <button
                onClick={() => install()}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/60 hover:text-white hover:bg-white/10 lg:text-muted-foreground lg:hover:text-primary lg:hover:bg-primary/5 rounded-lg border border-dashed border-white/20 lg:border-border transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Install Lini POS di perangkat ini
              </button>
            )}
          </div>
        </div>

        {/* Footer Sisi Kanan (Mobile & Desktop) */}
        <div className="text-[10px] text-white/40 lg:text-muted-foreground/45 text-center mt-6 select-none">
          Lini POS v1.2.0
        </div>
      </div>
    </div>
  );
}
