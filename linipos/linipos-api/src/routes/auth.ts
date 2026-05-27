import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { query } from '../db';
import { config } from '../config';
import { validate } from '../middleware/validate';
import { SyncUserSchema } from '../schemas/auth.schemas';
import { RegisterSchema, RegisterInput, LoginEmailSchema, LoginPinSchema, LoginEmailInput, LoginPinInput } from '../schemas/account.schemas';
import { broadcastChange } from '../socket';

const router = Router();

// Rate limiter khusus login email: 5 request/menit per IP
const emailLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Terlalu banyak percobaan login, coba lagi dalam 1 menit' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper: hash PIN with SHA-256
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// POST /auth/login — login dengan email + password
router.post('/login', emailLoginLimiter, validate(LoginEmailSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as LoginEmailInput;

    // Cari akun berdasarkan email
    const accounts = await query<Array<{ id: number; passwordHash: string; name: string }>>(
      'SELECT id, passwordHash, name FROM accounts WHERE email = ? LIMIT 1',
      [email]
    );

    if (!accounts || (accounts as Array<unknown>).length === 0) {
      res.status(401).json({ error: 'Email atau password salah' });
      return;
    }

    const account = (accounts as Array<{ id: number; passwordHash: string; name: string }>)[0];

    // Validasi password dengan bcrypt
    const isValid = await bcrypt.compare(password, account.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Email atau password salah' });
      return;
    }

    // Ambil storeId milik akun ini
    const stores = await query<Array<{ id: number; storeName: string }>>(
      'SELECT id, storeName FROM stores WHERE accountId = ? LIMIT 1',
      [account.id]
    );
    const storeId = stores && (stores as Array<unknown>).length > 0
      ? (stores as Array<{ id: number }>)[0].id
      : null;

    // Generate JWT 7 hari
    const token = jwt.sign(
      { accountId: account.id, storeId, role: 'owner' },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({ token, accountId: account.id, storeId, name: account.name, email });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login-pin — login kasir dengan PIN lokal (untuk sync JWT)
router.post('/login-pin', validate(LoginPinSchema), async (req: Request, res: Response) => {
  try {
    const { pin, storeId } = req.body as LoginPinInput;
    const pinHash = hashPin(pin);

    const rows = await query<Array<{ id: number; name: string; role: string; isActive: number }>>(  
      'SELECT id, name, role, isActive FROM users WHERE pin = ? AND storeId = ? AND isActive = 1 LIMIT 1',
      [pinHash, storeId]
    );

    if (!rows || (rows as Array<unknown>).length === 0) {
      res.status(401).json({ error: 'PIN salah' });
      return;
    }

    const user = (rows as Array<{ id: number; name: string; role: string; isActive: number }>)[0];
    const deviceId = (req.headers['x-device-id'] as string) || 'unknown';

    const token = jwt.sign(
      { userId: user.id, storeId, role: user.role, deviceId },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({ token, userId: user.id, name: user.name, role: user.role });
  } catch (err) {
    console.error('[auth/login-pin]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/sync-user — upsert user berdasarkan id dari IndexedDB
router.post('/sync-user', validate(SyncUserSchema), async (req: Request, res: Response) => {
  try {
    const { name, pin, role, isActive } = req.body as {
      name: string; pin: string; role: string; isActive: number;
    };
    const localId: number | undefined = (req.body as any).localId;
    // Ambil storeId dari JWT — WAJIB ada agar user tidak bocor antar store
    const storeId = req.user?.storeId ?? null;

    if (!storeId) {
      // Tanpa storeId, kita tidak bisa upsert dengan aman — tolak
      res.status(401).json({ error: 'storeId tidak ditemukan di token' });
      return;
    }

    if (localId) {
      // ✅ FIX: Cari user berdasarkan id DAN storeId supaya tidak bentrok antar akun
      const existing = await query<Array<{ id: number; storeId: number | null }>>(
        'SELECT id, storeId FROM users WHERE id = ? LIMIT 1', [localId]
      );

      if (existing && (existing as Array<unknown>).length > 0) {
        const existingUser = (existing as Array<{ id: number; storeId: number | null }>)[0];

        if (existingUser.storeId === storeId || existingUser.storeId === null) {
          // ✅ User milik store yang sama — aman untuk di-update
          await query(
            'UPDATE users SET name=?, pin=?, role=?, isActive=?, storeId=? WHERE id=? AND (storeId=? OR storeId IS NULL)',
            [name, pin, role, isActive, storeId, localId, storeId]
          );
          res.json({ id: localId, name, role });
          return;
        }
        // ❌ User dengan id ini milik store LAIN — jangan update, fall through ke insert baru
      } else {
        // Belum ada user dengan id ini — insert dengan id spesifik
        try {
          await query(
            'INSERT INTO users (id, name, pin, role, isActive, storeId) VALUES (?, ?, ?, ?, ?, ?)',
            [localId, name, pin, role, isActive, storeId]
          );
          res.json({ id: localId, name, role });
          return;
        } catch {
          // INSERT dengan id tertentu gagal (kemungkinan id duplikat dari store lain)
          // Fall through ke auto-increment insert di bawah
        }
      }
    }

    // ✅ FIX: Fallback cari berdasarkan pin DAN storeId — tidak boleh lintas store!
    const existingPin = await query<Array<{ id: number }>>(
      'SELECT id FROM users WHERE pin = ? AND storeId = ? LIMIT 1', [pin, storeId]
    );
    if (existingPin && (existingPin as Array<unknown>).length > 0) {
      const userId = (existingPin as Array<{ id: number }>)[0].id;
      await query(
        'UPDATE users SET name=?, role=?, isActive=? WHERE id=? AND storeId=?',
        [name, role, isActive, userId, storeId]
      );
      res.json({ id: userId, name, role });
      return;
    }

    // Insert baru dengan auto-increment id (aman, tidak bentrok)
    const result = await query<unknown>(
      'INSERT INTO users (name, pin, role, isActive, storeId) VALUES (?, ?, ?, ?, ?)',
      [name, pin, role, isActive, storeId]
    );
    const newId = (result as any).insertId;
    broadcastChange('users', 'upsert', { id: newId, name, role, isActive }, storeId ?? undefined);
    res.json({ id: newId, name, role });
  } catch (err) {
    console.error('[auth/sync-user]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// POST /auth/register — daftar akun baru (email + password)
router.post('/register', validate(RegisterSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body as RegisterInput;

    // Cek email duplikat
    const existing = await query<Array<{ id: number }>>(
      'SELECT id FROM accounts WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing && (existing as Array<unknown>).length > 0) {
      res.status(409).json({ error: 'Email sudah terdaftar' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert ke accounts
    const accountResult = await query<unknown>(
      'INSERT INTO accounts (email, passwordHash, name) VALUES (?, ?, ?)',
      [email, passwordHash, name]
    );
    const accountId = (accountResult as any).insertId as number;

    // Buat store untuk akun ini
    const storeResult = await query<unknown>(
      'INSERT INTO stores (accountId, storeName) VALUES (?, ?)',
      [accountId, `Toko ${name}`]
    );
    const storeId = (storeResult as any).insertId as number;

    // Auto-seed payment method configs untuk toko baru
    // tunai/transfer/qris aktif by default, debit/kredit/ewallet nonaktif
    await query(
      `INSERT IGNORE INTO paymentMethodConfigs (storeId, type, isActive)
       SELECT ?, type,
         CASE WHEN type IN ('tunai', 'transfer', 'qris') THEN 1 ELSE 0 END
       FROM paymentMethodDefaults`,
      [storeId]
    );

    // Generate JWT 7 hari
    const token = jwt.sign(
      { accountId, storeId, role: 'owner' },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, accountId, storeId, name, email });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;