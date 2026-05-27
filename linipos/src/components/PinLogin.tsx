import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type User } from '@/lib/db';
import { useAuth } from '@/lib/auth-context';
import { Lock, Delete, ChevronDown, User as UserIcon, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PinLogin() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserList, setShowUserList] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const { login, loginAsUser } = useAuth();

  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());
  const users = useLiveQuery(() => db.users.filter(u => u.isActive).toArray());

  const PIN_LENGTH = 4;

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleSubmit(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleSubmit = async (currentPin: string) => {
    let result;
    if (selectedUserId) {
      result = await loginAsUser(selectedUserId, currentPin);
      if (result.success) {
        const user = await db.users.get(selectedUserId);
        setWelcomeName(user?.name || '');
      }
    } else {
      result = await login(currentPin);
      if (result.success && result.user) {
        setWelcomeName(result.user.name);
      }
    }

    if (!result.success) {
      setError(result.error || 'PIN salah');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin('');
        setError('');
      }, 800);
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const selectedUser = selectedUserId ? users?.find(u => u.id === selectedUserId) : null;

  if (welcomeName) {
    return (
      <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center">
        <div className="text-center space-y-3 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <UserIcon className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold">Selamat datang!</h2>
          <p className="text-lg text-primary font-semibold">{welcomeName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center max-w-lg mx-auto px-6">
      {/* Store Name & Branding */}
      <div className="text-center mb-8">
        {storeSettings?.logo ? (
          <img src={storeSettings.logo} alt="Logo" className="w-16 h-16 rounded-2xl mx-auto mb-3 object-cover" />
        ) : (
          <div className="relative inline-block mb-3">
            <img
              src="/logolini.png"
              alt="Lini POS"
              className="w-16 h-16 rounded-2xl object-cover shadow-lg shadow-black/30"
            />
          </div>
        )}
        <h1 className="text-xl font-bold">{storeSettings?.storeName || 'Lini POS'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedUser ? `Login sebagai ${selectedUser.name}` : 'Masukkan PIN untuk masuk'}
        </p>
      </div>

      {/* PIN Dots */}
      <div className={cn('flex gap-3 mb-2', shake && 'animate-shake')}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 rounded-full transition-all duration-150',
              i < pin.length
                ? 'bg-primary scale-110'
                : 'bg-muted-foreground/20'
            )}
          />
        ))}
      </div>

      {/* Error Message */}
      <div className="h-6 mb-4">
        {error && (
          <p className="text-sm text-destructive font-medium animate-in fade-in duration-200">{error}</p>
        )}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
          <button
            key={digit}
            onClick={() => handleDigit(digit)}
            className="h-16 rounded-2xl bg-muted/50 hover:bg-muted text-xl font-bold transition-all active:scale-95 active:bg-primary/10"
          >
            {digit}
          </button>
        ))}
        <div /> {/* empty cell */}
        <button
          onClick={() => handleDigit('0')}
          className="h-16 rounded-2xl bg-muted/50 hover:bg-muted text-xl font-bold transition-all active:scale-95 active:bg-primary/10"
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          className="h-16 rounded-2xl bg-muted/50 hover:bg-muted flex items-center justify-center transition-all active:scale-95"
        >
          <Delete className="w-6 h-6 text-muted-foreground" />
        </button>
      </div>

      {/* Switch User */}
      {users && users.length > 1 && (
        <div className="mt-6 relative">
          <button
            onClick={() => setShowUserList(!showUserList)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <UserIcon className="w-4 h-4" />
            {selectedUser ? 'Ganti User' : 'Pilih User'}
            <ChevronDown className={cn('w-4 h-4 transition-transform', showUserList && 'rotate-180')} />
          </button>

          {showUserList && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* "Any user" option */}
              <button
                onClick={() => { setSelectedUserId(null); setShowUserList(false); setPin(''); }}
                className={cn(
                  'w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2',
                  !selectedUserId && 'bg-primary/5 text-primary font-semibold'
                )}
              >
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs">👥</div>
                Semua User
              </button>
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => { setSelectedUserId(user.id!); setShowUserList(false); setPin(''); }}
                  className={cn(
                    'w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2 border-t border-border',
                    selectedUserId === user.id && 'bg-primary/5 text-primary font-semibold'
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                    user.role === 'owner' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                  )}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span>{user.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5 capitalize">({user.role})</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
