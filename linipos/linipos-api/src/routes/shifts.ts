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
        `INSERT INTO shifts (id, userId, userName, openedAt, closedAt, status, openingCash, notes, storeId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           userId = VALUES(userId), userName = VALUES(userName),
           openedAt = VALUES(openedAt), closedAt = VALUES(closedAt),
           status = VALUES(status), openingCash = VALUES(openingCash), notes = VALUES(notes),
           storeId = COALESCE(storeId, VALUES(storeId))`,
        [s.id, s.userId, s.userName, s.openedAt ? new Date(s.openedAt) : new Date(),
         s.closedAt ? new Date(s.closedAt) : null, s.status ?? 'open',
         s.openingCash ?? 0, s.notes ?? null, storeId]
      );
    } else {
      const result = await query<any>(
        `INSERT INTO shifts (userId, userName, openedAt, closedAt, status, openingCash, notes, storeId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.userId, s.userName, s.openedAt ? new Date(s.openedAt) : new Date(),
         s.closedAt ? new Date(s.closedAt) : null, s.status ?? 'open',
         s.openingCash ?? 0, s.notes ?? null, storeId]
      );
      s.id = result.insertId;
    }
    broadcastChange('shifts', 'upsert', { ...s, storeId }, storeId);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /shifts]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
