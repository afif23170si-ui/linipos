import { useState, useEffect, useRef } from 'react';
import { Store, MapPin, Phone, ChevronRight, ChevronLeft, ShoppingCart, Package, BarChart3, Shield, Database, Palette, Download, CheckCircle2, Globe, Check, Smartphone, Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ThemeColorPicker from '@/components/ThemeColorPicker';
import { applyThemeColor } from '@/hooks/use-theme-color';
import { usePWAInstall } from '@/hooks/use-pwa-install';

interface OnboardingProps {
  onComplete: () => void;
}

const WELCOME_SLIDE = {
  title: 'Lini POS',
  subtitle: 'Kasir Digital untuk Bisnis Kamu',
  description: 'Kelola toko, catat transaksi, dan pantau profit — semua dalam satu aplikasi yang bisa dipakai offline.',
};

const tutorialSlides = [
  {
    icon: ShoppingCart,
    title: 'Kasir Cepat & Mudah',
    description: 'Proses transaksi dengan cepat. Pilih produk, atur diskon, dan pilih metode pembayaran — semua dalam hitungan detik.',
    color: 'text-primary bg-primary/10',
  },
  {
    icon: Package,
    title: 'Kelola Stok Otomatis',
    description: 'Catat barang masuk dari supplier, stok berkurang otomatis saat penjualan, dan HPP dihitung otomatis.',
    color: 'text-accent bg-accent/10',
  },
  {
    icon: BarChart3,
    title: 'Laporan Lengkap',
    description: 'Pantau penjualan harian, profit, dan produk terlaris. Semua data tersaji dalam grafik yang mudah dipahami.',
    color: 'text-success bg-success/10',
  },
  {
    icon: Shield,
    title: 'Data Aman di HP Kamu',
    description: 'Semua data tersimpan di perangkatmu. Tidak perlu internet, tidak perlu server. Gratis selamanya!',
    color: 'text-warning bg-warning/10',
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  // Steps: welcome (0), tutorial slides (1-4), install (5), store setup (6)
  const [step, setStep] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loadDummy, setLoadDummy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [themeColor, setThemeColorState] = useState('220');
  const [installDone, setInstallDone] = useState(false);
  const [storeLogo, setStoreLogo] = useState<string | undefined>(undefined);
  const { canInstall, isInstalled, install } = usePWAInstall();
  const touchStartX = useRef<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('File harus berupa gambar'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 256;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setStoreLogo(canvas.toDataURL('image/webp', 0.8));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const WELCOME_STEP = 0;
  const TUTORIAL_START = 1;
  const TUTORIAL_END = tutorialSlides.length; // 1..4
  const INSTALL_STEP = tutorialSlides.length + 1; // 5
  const STORE_STEP = tutorialSlides.length + 2;   // 6
  const totalSteps = tutorialSlides.length + 3; // welcome + tutorials + install + store

  const isWelcomeStep = step === WELCOME_STEP;
  const isTutorialStep = step >= TUTORIAL_START && step <= TUTORIAL_END;
  const isInstallStep = step === INSTALL_STEP;
  const isStoreStep = step === STORE_STEP;
  const tutorialIndex = step - TUTORIAL_START;

  // Apply default dark theme immediately when onboarding opens
  useEffect(() => {
    applyThemeColor('220');
  }, []);

  // Swipe to navigate (welcome + tutorial slides only, not store setup)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (step === STORE_STEP) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || step === STORE_STEP) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta > 0 && step < INSTALL_STEP) setStep(s => s + 1); // swipe left = next
    if (delta < 0 && step > 0 && step !== INSTALL_STEP) setStep(s => s - 1); // swipe right = back
  };

  const seedDummyData = async () => {
    const now = new Date();
    const disc: 'percentage' | 'nominal' | null = null;

    // ── Categories (data asli Oobee Nusantara) ──────────────────
    await db.categories.bulkAdd([
      { name: 'Purple Series', color: '#9500b3', icon: '🥤', createdAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Blue Series', color: '#1700c2', icon: '🥤', createdAt: now, isDeleted: 0, deletedAt: null },
    ]);

    // ── Products ────────────────────────────────────────────────
    await db.products.bulkAdd([
      { name: 'Oobee Original', sku: 'OC0001', categoryId: 1, price: 10000, hpp: 5460, stock: 999, unit: 'cup', description: '(Ubi + Susu + Keju)', unlimitedStock: true, sortOrder: 1, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Oobee Aren', sku: 'OA002', categoryId: 1, price: 12000, hpp: 6100, stock: 999, unit: 'cup', description: '(Ubi + Susu + Gula Aren + Keju)', unlimitedStock: true, sortOrder: 2, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Oobee Coffee Latte', sku: 'OCL003', categoryId: 1, price: 13000, hpp: 7600, stock: 999, unit: 'cup', description: 'Ubi ungu + SKM + Susu cair + Susu Creamy + Double shot Espresso', unlimitedStock: true, sortOrder: 3, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Oobee Matcha Fusion', sku: 'OMF004', categoryId: 1, price: 15000, hpp: 8000, stock: 999, unit: 'cup', description: 'Ubi ungu + SKM + Susu cair + Susu Creamy + Larutan Matcha bubuk', unlimitedStock: true, sortOrder: 4, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Pure Blue Telang', sku: 'PBT001', categoryId: 2, price: 5000, hpp: 2500, stock: 999, unit: 'pcs', description: 'Sirup Teh Telang + Air', unlimitedStock: true, sortOrder: 5, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Blue Ocean Soda', sku: 'BOS002', categoryId: 2, price: 7000, hpp: 3880, stock: 999, unit: 'pcs', description: 'Teh Telang Sirup + Soda Sprite', unlimitedStock: true, sortOrder: 6, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Electric Blue Lemon', sku: 'EBL003', categoryId: 2, price: 8000, hpp: 4880, stock: 999, unit: 'pcs', description: 'Teh Telang Sirup + Soda + Irisan Lemon', unlimitedStock: true, sortOrder: 7, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Blue Latte', sku: 'BL004', categoryId: 2, price: 12000, hpp: 4500, stock: 999, unit: 'pcs', description: 'Sirup Gula + Es batu + Susu UHT (tuang perlahan) + Teh Telang', unlimitedStock: true, sortOrder: 8, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
      { name: 'Blue Coffee Latte', sku: 'BCL005', categoryId: 2, price: 15000, hpp: 6200, stock: 999, unit: 'pcs', description: 'Sirup Gula + Es UHT (tuang perlahan) + Teh Telang + Shot/konsentrat kopi', unlimitedStock: true, sortOrder: 9, isActive: 1, createdAt: now, updatedAt: now, isDeleted: 0, deletedAt: null },
    ]);

    // ── Demo Transactions ───────────────────────────────────────
    const tx1Id = await db.transactions.add({
      subtotal: 22000, discountType: disc, discountValue: 0, discountAmount: 0, total: 22000,
      paymentMethodId: 1, paymentAmount: 50000, change: 28000, profit: 10440,
      date: new Date(now.getTime() - 3600000), receiptNumber: 'TX-DEMO-001',
      status: 'completed', type: 'sale',
    });
    await db.transactionItems.bulkAdd([
      { transactionId: tx1Id as number, productId: 1, productName: 'Oobee Original', quantity: 1, price: 10000, hpp: 5460, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 10000 },
      { transactionId: tx1Id as number, productId: 3, productName: 'Pure Blue Telang', quantity: 2, price: 5000, hpp: 2500, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 10000 },
      { transactionId: tx1Id as number, productId: 4, productName: 'Blue Ocean Soda', quantity: 1, price: 7000, hpp: 3880, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 7000 },
    ]);

    const tx2Id = await db.transactions.add({
      subtotal: 25000, discountType: disc, discountValue: 0, discountAmount: 0, total: 25000,
      paymentMethodId: 3, paymentAmount: 25000, change: 0, profit: 11660,
      date: new Date(now.getTime() - 1800000), receiptNumber: 'TX-DEMO-002',
      status: 'completed', type: 'sale',
    });
    await db.transactionItems.bulkAdd([
      { transactionId: tx2Id as number, productId: 2, productName: 'Oobee Aren', quantity: 1, price: 12000, hpp: 6100, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 12000 },
      { transactionId: tx2Id as number, productId: 5, productName: 'Electric Blue Lemon', quantity: 1, price: 8000, hpp: 4880, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 8000 },
      { transactionId: tx2Id as number, productId: 3, productName: 'Pure Blue Telang', quantity: 1, price: 5000, hpp: 2500, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 5000 },
    ]);

    const tx3Id = await db.transactions.add({
      subtotal: 27000, discountType: disc, discountValue: 0, discountAmount: 0, total: 27000,
      paymentMethodId: 1, paymentAmount: 30000, change: 3000, profit: 12740,
      date: new Date(now.getTime() - 900000), receiptNumber: 'TX-DEMO-003',
      status: 'completed', type: 'sale',
    });
    await db.transactionItems.bulkAdd([
      { transactionId: tx3Id as number, productId: 6, productName: 'Blue Latte', quantity: 1, price: 12000, hpp: 4500, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 12000 },
      { transactionId: tx3Id as number, productId: 1, productName: 'Oobee Original', quantity: 1, price: 10000, hpp: 5460, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 10000 },
      { transactionId: tx3Id as number, productId: 3, productName: 'Pure Blue Telang', quantity: 1, price: 5000, hpp: 2500, discountType: disc, discountValue: 0, discountAmount: 0, subtotal: 5000 },
    ]);
  };

  const handleFinish = async () => {
    const finalStoreName = storeName.trim() || 'Toko Saya';
    setSaving(true);
    try {
      const existing = await db.storeSettings.toCollection().first();
      if (existing?.id) {
        await db.storeSettings.update(existing.id, {
          storeName: finalStoreName,
          address: address.trim(),
          phone: phone.trim(),
          onboardingDone: true,
          themeColor,
          logo: storeLogo,
        });
      } else {
        await db.storeSettings.add({
          storeName: finalStoreName,
          address: address.trim(),
          phone: phone.trim(),
          receiptFooter: 'Terima kasih atas kunjungan Anda!',
          onboardingDone: true,
          lastBackupAt: null,
          themeColor,
          logo: storeLogo,
          deviceId: crypto.randomUUID(),
        });
      }

      if (loadDummy) {
        // Hapus kategori default dulu, ganti dengan data Oobee
        await db.categories.clear();
        await seedDummyData();
      }

      // Push semua data ke server setelah setup selesai
      import('@/lib/api-client').then(({ pushAllData }) => pushAllData());

      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-background overflow-y-auto w-screen h-screen animate-fade-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="grid lg:grid-cols-2 min-h-screen bg-cover bg-center bg-no-repeat lg:bg-none relative text-foreground"
        style={{ backgroundImage: "url('/auth-bg.webp')" }}
      >
        {/* Background Overlay for Mobile & Tablet only */}
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] lg:hidden z-0" />

        {/* ── KOLOM KIRI: BRANDING & TUTORIAL PREVIEW (Hanya Desktop >= lg) ── */}
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

          {/* Center Tagline & Features Grid (Frosted Glass Style) */}
          <div className="space-y-6 my-auto max-w-md mx-auto w-full relative z-10">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-primary tracking-widest uppercase">
                Selamat Datang di Lini POS
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-white leading-snug">
                Kasir Digital Handal untuk Tumbuh Kembangkan Bisnis Anda.
              </h2>
            </div>

            {/* List Fitur Utama (Liquid Glass Style) */}
            <div className="grid gap-3.5">
              {tutorialSlides.map((slide, idx) => {
                const Icon = slide.icon;
                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex gap-4 p-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg transition-all hover:bg-white/10 hover:border-white/20",
                      idx === tutorialIndex && isTutorialStep ? "ring-2 ring-primary bg-white/10 border-white/30" : ""
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/20 text-white flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{slide.title}</h3>
                      <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                        {slide.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Sisi Kiri */}
          <div className="text-xs text-white/40 text-left relative z-10">
            &copy; {new Date().getFullYear()} Lini POS. Semua hak dilindungi.
          </div>
        </div>

        {/* ── KOLOM KANAN: INTERACTIVE ONBOARDING STEPS ── */}
        <div className="flex flex-col justify-center items-center p-4 py-8 sm:p-10 lg:p-16 bg-transparent lg:bg-background relative z-10 min-h-screen lg:min-h-0 w-full">
          {/* Floating Card Container on Mobile, Clean & Flat on Desktop */}
          <div className="w-full max-w-md bg-black/45 backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:p-0 lg:shadow-none lg:rounded-none space-y-6 transition-all relative z-10 flex flex-col justify-between min-h-[480px] lg:min-h-0">

            <div>
              {/* Progress Dots */}
              {!isWelcomeStep && (
                <div className="flex items-center justify-center gap-2 pb-6">
                  {Array.from({ length: totalSteps - 1 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-300',
                        (i + 1) === step
                          ? 'w-6 bg-white lg:bg-primary'
                          : 'w-1.5 bg-white/20 lg:bg-muted-foreground/20'
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Step Content */}
              {isWelcomeStep ? (
                /* === WELCOME HERO SLIDE === */
                <div className="flex flex-col items-center text-center space-y-6 py-4">
                  {/* Lini POS Logo */}
                  <div className="relative inline-block">
                    <img
                      src="/logolini.png"
                      alt="Lini POS"
                      className="w-24 h-24 rounded-3xl shadow-2xl shadow-black/40 object-cover border border-white/10"
                    />
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md">
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </div>
                  </div>

                  {/* Branding */}
                  <div className="space-y-2">
                    <h1 className="text-3xl font-extrabold tracking-tight text-white lg:text-foreground">
                      {WELCOME_SLIDE.title}
                    </h1>
                    <p className="text-sm font-semibold text-white/90 lg:text-foreground/90">{WELCOME_SLIDE.subtitle}</p>
                    <p className="text-xs text-white/70 lg:text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      {WELCOME_SLIDE.description}
                    </p>
                  </div>

                  {/* Feature badges */}
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
                    {['Kasir Cepat', 'Kelola Stok', 'Laporan PDF', 'Offline Ready'].map(badge => (
                      <span
                        key={badge}
                        className="text-[10px] font-semibold bg-white/10 text-white border border-white/10 lg:bg-primary/10 lg:text-primary lg:border-primary/10 px-2.5 py-1 rounded-full"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              ) : isTutorialStep ? (
                /* Tutorial slides */
                <div className="flex flex-col items-center text-center space-y-6 py-6">
                  {(() => {
                    const slide = tutorialSlides[tutorialIndex];
                    const Icon = slide.icon;
                    return (
                      <>
                        <div className={cn('w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg', slide.color)}>
                          <Icon className="w-10 h-10" />
                        </div>
                        <div className="space-y-2">
                          <h2 className="text-xl font-bold tracking-tight text-white lg:text-foreground">{slide.title}</h2>
                          <p className="text-xs text-white/70 lg:text-muted-foreground leading-relaxed max-w-xs mx-auto">
                            {slide.description}
                          </p>
                        </div>
                        <p className="text-[10px] text-white/40 lg:text-muted-foreground/50 animate-pulse">
                          ← Swipe kiri/kanan untuk menjelajah →
                        </p>
                      </>
                    );
                  })()}
                </div>
              ) : isInstallStep ? (
                /* Install step */
                <div className="flex flex-col items-center text-center space-y-5 py-4">
                  {isInstalled || installDone ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-success/20 text-success flex items-center justify-center shadow-lg">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold tracking-tight text-white lg:text-foreground">Berhasil Terinstall! 🎉</h2>
                        <p className="text-xs text-white/70 lg:text-muted-foreground">Lini POS sudah ada di home screen kamu.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center shadow-lg">
                        <Smartphone className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold tracking-tight text-white lg:text-foreground">Install Aplikasi</h2>
                        <p className="text-xs text-white/70 lg:text-muted-foreground max-w-xs mx-auto">
                          Akses Lini POS langsung dari home screen untuk performa offline maksimal!
                        </p>
                      </div>

                      {canInstall ? (
                        <div className="space-y-2 w-full max-w-xs pt-2">
                          <Button
                            size="lg"
                            className="w-full h-11 text-sm font-semibold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all animate-pulse"
                            onClick={async () => {
                              const ok = await install();
                              if (ok) { setInstallDone(true); toast.success('Berhasil install Lini POS!'); }
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Install Sekarang
                          </Button>
                          <Button
                            variant="ghost"
                            size="lg"
                            className="w-full h-10 text-xs text-white/75 hover:text-white lg:text-muted-foreground lg:hover:text-foreground"
                            onClick={() => setStep(s => s + 1)}
                          >
                            <Globe className="w-3.5 h-3.5 mr-1.5" />
                            Lanjut di Browser
                          </Button>
                        </div>
                      ) : (
                        <div className="w-full max-w-xs space-y-2 text-left pt-2">
                          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 lg:bg-muted/50 lg:border-border">
                            <span className="text-lg mt-0.5">🤖</span>
                            <div>
                              <p className="text-xs font-bold text-white lg:text-foreground">Android (Chrome)</p>
                              <p className="text-[10px] text-white/70 lg:text-muted-foreground mt-0.5 leading-relaxed">
                                Ketuk menu <strong>⋮</strong> → <strong>"Tambahkan ke layar utama"</strong> atau <strong>"Install app"</strong>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 lg:bg-muted/50 lg:border-border">
                            <span className="text-lg mt-0.5">🍎</span>
                            <div>
                              <p className="text-xs font-bold text-white lg:text-foreground">iPhone / iPad (Safari)</p>
                              <p className="text-[10px] text-white/70 lg:text-muted-foreground mt-0.5 leading-relaxed">
                                Ketuk tombol <strong>Share ↑</strong> → <strong>"Tambahkan ke Layar Utama"</strong>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 lg:bg-muted/50 lg:border-border">
                            <span className="text-lg mt-0.5">💻</span>
                            <div>
                              <p className="text-xs font-bold text-white lg:text-foreground">Desktop (Chrome/Edge)</p>
                              <p className="text-[10px] text-white/70 lg:text-muted-foreground mt-0.5 leading-relaxed">
                                Klik ikon <strong>⊕</strong> di address bar → <strong>"Install"</strong>
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* Store setup - LAST */
                <div className="flex flex-col space-y-4 py-2">
                  <div className="text-center space-y-2">
                    {/* Logo Uploader */}
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="w-16 h-16 rounded-full bg-white/5 border-2 border-dashed border-white/20 lg:bg-muted lg:border-border flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/50 transition-colors relative group shadow-inner"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {storeLogo ? (
                          <>
                            <img src={storeLogo} alt="Logo" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Camera className="w-4 h-4 text-white" />
                            </div>
                          </>
                        ) : (
                          <Camera className="w-6 h-6 text-white/40 lg:text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="text-[10px] text-white lg:text-primary font-bold px-2.5 py-1 rounded-lg bg-white/10 lg:bg-primary/10 hover:bg-white/20 lg:hover:bg-primary/20 transition-colors border border-white/10 lg:border-transparent"
                        >
                          {storeLogo ? 'Ganti Logo' : 'Upload Logo'}
                        </button>
                        {storeLogo && (
                          <button
                            type="button"
                            onClick={() => setStoreLogo(undefined)}
                            className="text-[10px] text-destructive font-bold px-2.5 py-1 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors flex items-center gap-1"
                          >
                            <X className="w-2.5 h-2.5" /> Hapus
                          </button>
                        )}
                      </div>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                    </div>

                    <h2 className="text-lg font-bold tracking-tight text-white lg:text-foreground">Setup Toko Kamu</h2>
                    <p className="text-[10px] text-white/70 lg:text-muted-foreground">Informasi ini akan tampil di struk belanja</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="storeName" className="text-xs font-semibold text-white/80 lg:text-foreground/80 flex items-center gap-1">
                        <Store className="w-3 h-3 text-primary" />
                        Nama Toko <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="storeName"
                        placeholder="Contoh: Toko Berkah Jaya"
                        value={storeName}
                        onChange={e => setStoreName(e.target.value)}
                        className="h-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 lg:bg-background lg:border-border lg:text-foreground lg:placeholder:text-muted-foreground text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="address" className="text-xs font-semibold text-white/80 lg:text-foreground/80 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-primary" />
                        Alamat
                      </Label>
                      <Input
                        id="address"
                        placeholder="Contoh: Jl. Merdeka No. 10"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        className="h-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 lg:bg-background lg:border-border lg:text-foreground lg:placeholder:text-muted-foreground text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="phone" className="text-xs font-semibold text-white/80 lg:text-foreground/80 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-primary" />
                        Nomor Telepon
                      </Label>
                      <Input
                        id="phone"
                        placeholder="Contoh: 08123456789"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="h-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40 lg:bg-background lg:border-border lg:text-foreground lg:placeholder:text-muted-foreground text-xs"
                        type="tel"
                      />
                    </div>

                    {/* Dummy data toggle */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 lg:bg-muted/50 lg:border-border">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0">
                          <Database className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white lg:text-foreground">Muat data contoh</p>
                          <p className="text-[9px] text-white/60 lg:text-muted-foreground">9 produk Oobee, 2 kategori, 3 transaksi demo</p>
                        </div>
                      </div>
                      <Switch checked={loadDummy} onCheckedChange={setLoadDummy} />
                    </div>

                    {/* Theme color picker */}
                    <div className="space-y-2 p-2.5 rounded-xl bg-white/5 border border-white/10 lg:bg-muted/50 lg:border-border">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                          <Palette className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white lg:text-foreground">Warna Tema</p>
                          <p className="text-[9px] text-white/60 lg:text-muted-foreground">Pilih warna utama aplikasi</p>
                        </div>
                      </div>
                      <ThemeColorPicker
                        value={themeColor}
                        onChange={hue => {
                          setThemeColorState(hue);
                          applyThemeColor(hue);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-3 pt-4 w-full">
              {/* Back button */}
              {step > 0 && !isInstallStep && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep(s => s - 1)}
                  className="h-11 px-4 rounded-xl border-white/15 text-white bg-white/5 hover:bg-white/10 lg:border-border lg:text-foreground lg:bg-background lg:hover:bg-accent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              {isWelcomeStep ? (
                <Button
                  size="lg"
                  className="flex-1 h-11 text-sm font-semibold rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md"
                  onClick={() => setStep(1)}
                >
                  Mulai Setup
                  <ChevronRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : isInstallStep ? (
                <>
                  {(isInstalled || installDone) && (
                    <Button
                      size="lg"
                      className="flex-1 h-11 text-sm font-semibold rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md"
                      onClick={() => setStep(s => s + 1)}
                    >
                      Lanjut ke Setup
                      <ChevronRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  )}
                  {!canInstall && !isInstalled && !installDone && (
                    <Button
                      size="lg"
                      className="flex-1 h-11 text-xs font-semibold rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/20 lg:bg-muted lg:border-border lg:text-muted-foreground lg:hover:bg-muted/80 shadow-md"
                      onClick={() => setStep(s => s + 1)}
                    >
                      Lanjutkan di Browser
                      <ChevronRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  )}
                </>
              ) : isStoreStep ? (
                <>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-11 text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 lg:text-muted-foreground lg:hover:text-foreground lg:hover:bg-transparent"
                    onClick={() => {
                      setStoreName(storeName.trim() || 'Toko Saya');
                      handleFinish();
                    }}
                    disabled={saving}
                  >
                    Lewati
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1 h-11 text-sm font-semibold rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md"
                    onClick={handleFinish}
                    disabled={!storeName.trim() || saving}
                  >
                    {saving ? 'Menyimpan...' : 'Mulai Jualan! 🚀'}
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  className="flex-1 h-11 text-sm font-semibold rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md"
                  onClick={() => setStep(s => s + 1)}
                >
                  Lanjut
                  <ChevronRight className="w-4 h-4 ml-1.5" />
                </Button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
