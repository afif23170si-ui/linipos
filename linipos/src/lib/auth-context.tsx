import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { db, type User } from '@/lib/db';
import { verifyPin } from '@/lib/hash-utils';
import { syncUser, apiLogin, syncFromServer } from '@/lib/api-client';

interface AuthContextType {
  currentUser: User | null;
  login: (pin: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  loginAsUser: (userId: number, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isOwner: boolean;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'kasirgratisan-auth-user-id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const storedId = sessionStorage.getItem(SESSION_KEY);
      if (storedId) {
        const user = await db.users.get(Number(storedId));
        if (user && user.isActive) {
          setCurrentUser(user);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
      setInitialized(true);
    };
    restore();
  }, []);

  // Try all active users to find a PIN match
  const login = useCallback(async (pin: string): Promise<{ success: boolean; user?: User; error?: string }> => {
    const users = await db.users.filter(u => u.isActive).toArray();
    if (users.length === 0) {
      return { success: false, error: 'Belum ada user terdaftar' };
    }

    for (const user of users) {
      const match = await verifyPin(pin, user.pin);
      if (match) {
        setCurrentUser(user);
        sessionStorage.setItem(SESSION_KEY, String(user.id));
        // ✅ FIX: syncUser DULU pakai JWT yang ada saat ini (bisa email JWT dari registrasi).
        // Baru KEMUDIAN apiLogin() ganti JWT ke PIN JWT dan pull data dari server.
        syncUser(user);                                    // fire-and-forget, pakai JWT saat ini
        apiLogin(pin).then(() => syncFromServer());        // fire-and-forget
        return { success: true, user };
      }
    }

    return { success: false, error: 'PIN salah' };
  }, []);

  // Login a specific user by ID
  const loginAsUser = useCallback(async (userId: number, pin: string): Promise<{ success: boolean; error?: string }> => {
    const user = await db.users.get(userId);
    if (!user || !user.isActive) {
      return { success: false, error: 'User tidak ditemukan' };
    }

    const match = await verifyPin(pin, user.pin);
    if (!match) {
      return { success: false, error: 'PIN salah' };
    }

    setCurrentUser(user);
    sessionStorage.setItem(SESSION_KEY, String(user.id));
    // ✅ FIX: syncUser DULU pakai JWT yang ada, baru get PIN JWT dan pull data
    syncUser(user);                                    // fire-and-forget, pakai JWT saat ini
    apiLogin(pin).then(() => syncFromServer());        // fire-and-forget
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const value: AuthContextType = {
    currentUser,
    login,
    loginAsUser,
    logout,
    isOwner: currentUser?.role === 'owner',
    isLoggedIn: currentUser !== null,
  };

  // Don't render children until session is restored
  if (!initialized) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
