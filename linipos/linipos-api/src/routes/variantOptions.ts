import { Router, Request, Response } from 'express';
import { query } from '../db';
import { broadcastChange } from '../socket';

const router = Router();

// POST /variant-options — upsert by id
router.post('/', async (req: Request, res: Response) => {
  try {
    const v = req.body as any;
    if (v.id) {
      await query(
        `INSERT INTO variantOptions (id, variantGroupId, productId, name, price, hpp, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           variantGroupId = VALUES(variantGroupId), productId = VALUES(productId),
           name = VALUES(name), price = VALUES(price), hpp = VALUES(hpp),
           sortOrder = VALUES(sortOrder), updatedAt = NOW()`,
        [v.id, v.variantGroupId, v.productId, v.name, v.price, v.hpp, v.sortOrder ?? 0]
      );
    } else {
      await query(
        `INSERT INTO variantOptions (variantGroupId, productId, name, price, hpp, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [v.variantGroupId, v.productId, v.name, v.price, v.hpp, v.sortOrder ?? 0]
      );
    }
    broadcastChange('variantOptions', 'upsert', v);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /variant-options]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
