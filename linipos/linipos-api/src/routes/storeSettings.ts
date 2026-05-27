import { Router, Request, Response } from 'express';
import { query } from '../db';
import { broadcastChange } from '../socket';

const router = Router();

// POST /store-settings — upsert store settings, scoped to storeId
router.post('/', async (req: Request, res: Response) => {
  try {
    const s = req.body as any;
    const storeId = req.user?.storeId ?? null;

    const existing = await query<Array<{ id: number }>>(
      'SELECT id FROM storeSettings WHERE storeId = ? LIMIT 1',
      [storeId]
    );

    if (existing && (existing as Array<unknown>).length > 0) {
      const id = (existing as Array<{ id: number }>)[0].id;
      await query(
        `UPDATE storeSettings SET
           storeName=?, address=?, phone=?, receiptFooter=?,
           themeColor=?, logo=?, deviceId=?, updatedAt=NOW()
         WHERE id=?`,
        [s.storeName ?? 'Toko Saya', s.address ?? '', s.phone ?? '',
         s.receiptFooter ?? '', s.themeColor ?? null, s.logo ?? null, s.deviceId ?? '', id]
      );
    } else {
      await query(
        `INSERT INTO storeSettings
           (storeName, address, phone, receiptFooter, onboardingDone, themeColor, logo, deviceId, storeId)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [s.storeName ?? 'Toko Saya', s.address ?? '', s.phone ?? '',
         s.receiptFooter ?? '', s.themeColor ?? null, s.logo ?? null, s.deviceId ?? '', storeId]
      );
    }
    res.json({ ok: true });
    const { logo: _logo, ...broadcastData } = s;
    broadcastChange('storeSettings', 'upsert', { ...broadcastData, storeId }, storeId);
  } catch (err) {
    console.error('[POST /store-settings]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
