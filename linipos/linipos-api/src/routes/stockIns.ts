import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// POST /stock-ins — upsert by id
router.post('/', async (req: Request, res: Response) => {
  try {
    const s = req.body as any;
    if (s.id) {
      await query(
        `INSERT INTO stockIns (id, productId, supplierId, quantity, buyPrice, totalPrice, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           productId = VALUES(productId), supplierId = VALUES(supplierId),
           quantity = VALUES(quantity), buyPrice = VALUES(buyPrice),
           totalPrice = VALUES(totalPrice), date = VALUES(date), notes = VALUES(notes)`,
        [s.id, s.productId, s.supplierId ?? 0, s.quantity, s.buyPrice, s.totalPrice,
         s.date ? new Date(s.date) : new Date(), s.notes ?? '']
      );
    } else {
      await query(
        `INSERT INTO stockIns (productId, supplierId, quantity, buyPrice, totalPrice, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.productId, s.supplierId ?? 0, s.quantity, s.buyPrice, s.totalPrice,
         s.date ? new Date(s.date) : new Date(), s.notes ?? '']
      );
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /stock-ins]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
