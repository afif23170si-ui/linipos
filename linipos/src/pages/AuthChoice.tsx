import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Store, LogIn, LineChart, CloudLightning, Download } from 'lucide-react';
import { applyThemeColor } from '@/hooks/use-theme-color';
import { usePWAInstall } from '@/hooks/use-pwa-install';

export default function AuthChoice() {
  const navigate = useNavigate();
  const { canInstall, install } = usePWAInstall();

  useEffect(() => {
    applyThemeColor('220'); // default dark theme (Hitam HSL 220)
  }, []);

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
        <div className="inline-flex items-center gap-2.5 relative z-10">
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

      {/* ── KOLOM KANAN: PILIHAN MASUK / DAFTAR (Desktop, Tablet & Mobile) ── */}
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
              className="w-12 h-12 rounded-xl shadow-md object-cover border border-white/10 lg:border-border"
            />
            <div className="space-y-0.5">
              <h1 className="text-xl font-bold tracking-tight text-white lg:text-foreground">Lini POS</h1>
              <p className="text-xs text-white/70 lg:text-muted-foreground">Kasir Digital untuk Bisnis Kamu</p>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:block space-y-1.5 text-left">
            <h2 className="text-xl font-extrabold tracking-tight">Selamat Datang</h2>
            <p className="text-xs text-muted-foreground leading-normal">Pilih langkah awal untuk mengelola tokomu</p>
          </div>

          {/* Pilihan Tombol */}
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full h-12 text-sm font-semibold rounded-2xl gap-3 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
              onClick={() => navigate('/register')}
            >
              <Store className="w-4 h-4" />
              Buat Toko Baru
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="w-full h-12 text-sm font-semibold rounded-2xl gap-3 border-white/20 text-white hover:bg-white/10 hover:text-white lg:border-border lg:text-foreground lg:hover:bg-muted/50 lg:hover:text-foreground transition-all active:scale-[0.98] bg-transparent lg:bg-transparent"
              onClick={() => navigate('/login')}
            >
              <LogIn className="w-4 h-4" />
              Masuk ke Akun
            </Button>

            <p className="text-center text-[11px] text-white/60 lg:text-muted-foreground pt-2 leading-relaxed">
              Sudah punya akun? Pilih <strong className="text-white lg:text-foreground">"Masuk ke Akun"</strong> untuk memulihkan dan menyinkronkan data toko Anda.
            </p>

            {/* Install PWA */}
            {canInstall && (
              <button
                onClick={() => install()}
                className="flex items-center justify-center gap-2 w-full mt-4 py-2 text-[11px] text-white/60 hover:text-white hover:bg-white/10 lg:text-muted-foreground lg:hover:text-primary lg:hover:bg-primary/5 rounded-xl border border-dashed border-white/20 lg:border-border transition-all"
              >
                <Download className="w-3 h-3" />
                Install aplikasi ke perangkat ini
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
