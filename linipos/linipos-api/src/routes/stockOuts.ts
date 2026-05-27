import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// POST /stock-outs — upsert by id
router.post('/', async (req: Request, res: Response) => {
  try {
    const s = req.body as any;
    if (s.id) {
      await query(
        `INSERT INTO stockOuts (id, productId, quantity, reason, date, notes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           productId = VALUES(productId), quantity = VALUES(quantity),
           reason = VALUES(reason), date = VALUES(date), notes = VALUES(notes)`,
        [s.id, s.productId, s.quantity, s.reason ?? '', s.date ? new Date(s.date) : new Date(), s.notes ?? '']
      );
    } else {
      await query(
        `INSERT INTO stockOuts (productId, quantity, reason, date, notes) VALUES (?, ?, ?, ?, ?)`,
        [s.productId, s.quantity, s.reason ?? '', s.date ? new Date(s.date) : new Date(), s.notes ?? '']
      );
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /stock-outs]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
