import { Router, Request, Response } from 'express';
import { query } from '../db';
import { broadcastChange } from '../socket';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const s = req.body as any;
    const storeId = req.user?.storeId ?? null;
    if (s.id) {
      await query(
        `INSERT INTO suppliers (id, name, phone, address, notes, isDeleted, deletedAt, createdAt, storeId)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), phone = VALUES(phone), address = VALUES(address),
           notes = VALUES(notes), isDeleted = VALUES(isDeleted),
           deletedAt = VALUES(deletedAt), updatedAt = NOW(),
           storeId = COALESCE(storeId, VALUES(storeId))`,
        [s.id, s.name, s.phone ?? '', s.address ?? '', s.notes ?? '',
         s.isDeleted ?? 0, s.deletedAt ? new Date(s.deletedAt) : null, storeId]
      );
    } else {
      await query(
        `INSERT INTO suppliers (name, phone, address, notes, isDeleted, createdAt, storeId)
         VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
        [s.name, s.phone ?? '', s.address ?? '', s.notes ?? '', s.isDeleted ?? 0, storeId]
      );
    }
    broadcastChange('suppliers', 'upsert', { ...s, storeId }, storeId);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /suppliers]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
