import { useState } from 'react';
import { db } from '@/lib/db';
import { hashPin } from '@/lib/hash-utils';
import { useAuth } from '@/lib/auth-context';
import { syncUser } from '@/lib/api-client';
import { Shield, User, Lock, Check, ChevronRight, ChevronLeft, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SetupOwnerPinProps {
  onComplete: () => void;
  /** If true, this is shown as part of onboarding (embedded step) */
  embedded?: boolean;
}

type Step = 'name' | 'pin' | 'confirm';

export default function SetupOwnerPin({ onComplete, embedded = false }: SetupOwnerPinProps) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { login } = useAuth();

  const PIN_LENGTH = 4;

  const handlePinDigit = (digit: string, target: 'pin' | 'confirm') => {
    if (target === 'pin' && pin.length < PIN_LENGTH) {
      setPin(prev => prev + digit);
      setError('');
    } else if (target === 'confirm' && confirmPin.length < PIN_LENGTH) {
      const newConfirm = confirmPin + digit;
      setConfirmPin(newConfirm);
      setError('');

      // Auto-submit when confirm PIN is complete
      if (newConfirm.length === PIN_LENGTH) {
        if (newConfirm !== pin) {
          setError('PIN tidak cocok');
          setTimeout(() => {
            setConfirmPin('');
            setError('');
          }, 800);
        }
      }
    }
  };

  const handleBackspace = (target: 'pin' | 'confirm') => {
    if (target === 'pin') {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
    setError('');
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Nama harus diisi'); return; }
    if (pin.length < PIN_LENGTH) { setError(`PIN harus ${PIN_LENGTH} digit`); return; }
    if (pin !== confirmPin) { setError('PIN tidak cocok'); return; }

    setSaving(true);
    try {
      const hashedPin = await hashPin(pin);
      const newUser = {
        name: name.trim(),
        pin: hashedPin,
        role: 'owner' as const,
        isActive: true,
        createdAt: new Date(),
      };
      const userId = await db.users.add(newUser);

      // ✅ FIX: Kirim owner ke server SEKARANG, pakai email JWT yang masih aktif.
      // Harus SEBELUM login(pin) karena apiLogin() di dalam login() akan
      // mengganti email JWT dengan PIN JWT, sehingga syncUser kehilangan konteks store.
      syncUser({ ...newUser, id: userId as number }).catch(() => {});

      // Auto-login the new owner
      await login(pin);
      toast.success('PIN Owner berhasil dibuat!');
      onComplete();
    } catch (err) {
      toast.error('Gagal menyimpan data');
    } finally {
      setSaving(false);
    }
  };

  const Numpad = ({ target }: { target: 'pin' | 'confirm' }) => {
    const value = target === 'pin' ? pin : confirmPin;
    return (
      <div className="space-y-4">
        {/* PIN dots */}
        <div className={cn('flex gap-3 justify-center', error && 'animate-shake')}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-4 h-4 rounded-full transition-all duration-150',
                i < value.length ? 'bg-primary scale-110' : 'bg-muted-foreground/20'
              )}
            />
          ))}
        </div>

        {error && <p className="text-sm text-destructive text-center font-medium">{error}</p>}

        {/* Numpad grid */}
        <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
            <button
              key={digit}
              onClick={() => handlePinDigit(digit, target)}
              className="h-14 rounded-xl bg-muted/50 hover:bg-muted text-lg font-bold transition-all active:scale-95"
            >
              {digit}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePinDigit('0', target)}
            className="h-14 rounded-xl bg-muted/50 hover:bg-muted text-lg font-bold transition-all active:scale-95"
          >
            0
          </button>
          <button
            onClick={() => handleBackspace(target)}
            className="h-14 rounded-xl bg-muted/50 hover:bg-muted flex items-center justify-center transition-all active:scale-95"
          >
            <Delete className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  };

  const containerClass = embedded
    ? 'flex-1 flex flex-col items-center justify-center text-center space-y-6'
    : 'fixed inset-0 z-[150] bg-background flex flex-col items-center justify-center max-w-lg mx-auto px-6';

  return (
    <div className={containerClass}>
      {step === 'name' && (
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center space-y-2">
            {/* Lini POS badge */}
            <div className="flex justify-center">
              <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">Lini POS</span>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold">Buat Akun Owner</h2>
            <p className="text-sm text-muted-foreground">
              Sebagai pemilik toko, kamu akan punya akses penuh ke semua fitur
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ownerName" className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Nama Kamu <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ownerName"
              placeholder="Contoh: Budi"
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-12"
              autoFocus
            />
          </div>

          {!embedded && (
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={() => { if (name.trim()) setStep('pin'); else setError('Nama harus diisi'); }}
              disabled={!name.trim()}
            >
              Lanjut
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      )}

      {step === 'pin' && (
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold">Buat PIN</h2>
            <p className="text-sm text-muted-foreground">
              Masukkan {PIN_LENGTH} digit PIN untuk login
            </p>
          </div>

          <Numpad target="pin" />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => { setStep('name'); setPin(''); }}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              className="flex-1 h-11 text-base font-semibold"
              onClick={() => { if (pin.length === PIN_LENGTH) setStep('confirm'); }}
              disabled={pin.length < PIN_LENGTH}
            >
              Lanjut
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-success/10 text-success flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold">Konfirmasi PIN</h2>
            <p className="text-sm text-muted-foreground">
              Masukkan ulang PIN yang sama
            </p>
          </div>

          <Numpad target="confirm" />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => { setStep('pin'); setConfirmPin(''); setPin(''); }}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              className="flex-1 h-11 text-base font-semibold"
              onClick={handleSave}
              disabled={confirmPin.length < PIN_LENGTH || pin !== confirmPin || saving}
            >
              {saving ? 'Menyimpan...' : 'Simpan PIN 🔒'}
            </Button>
          </div>
        </div>
      )}

      {/* Step navigation for embedded mode */}
      {embedded && step === 'name' && (
        <Button
          className="w-full max-w-xs h-12 text-base font-semibold"
          onClick={() => { if (name.trim()) setStep('pin'); else setError('Nama harus diisi'); }}
          disabled={!name.trim()}
        >
          Lanjut Buat PIN
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      )}
    </div>
  );
}
