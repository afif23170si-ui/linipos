import { Router, Request, Response } from 'express';
import { query } from '../db';
import { broadcastChange } from '../socket';

const router = Router();

/**
 * POST /variant-groups/replace-by-sku
 * Atomic replace: cari produk by SKU → delete variant lama → insert baru → broadcast sekali.
 * Menggunakan SKU (bukan local IndexedDB ID) karena local productId ≠ server productId.
 */
router.post('/replace-by-sku', async (req: Request, res: Response) => {
  try {
    const { sku, groups } = req.body as {
      sku: string;
      groups: Array<{
        name: string;
        sortOrder: number;
        options: Array<{ name: string; price: number; hpp: number; sortOrder: number }>;
      }>;
    };

    if (!sku) { res.status(400).json({ error: 'sku wajib diisi' }); return; }

    // 1. Cari server productId by SKU
    const productRows = await query<Array<{ id: number }>>(
      'SELECT id FROM products WHERE sku = ? AND isDeleted = 0 LIMIT 1', [sku]
    );
    const productId = (productRows as Array<{ id: number }>)[0]?.id;
    if (!productId) {
      // Produk belum ada di server — 202 supaya frontend tidak retry error
      res.status(202).json({ ok: false, reason: 'product_not_found_yet', sku });
      return;
    }

    // 2. DELETE semua variant lama (CASCADE hapus options juga)
    await query('DELETE FROM variantGroups WHERE productId = ?', [productId]);

    // 3. Insert groups + options baru
    const savedGroups: Array<{
      id: number; name: string; sortOrder: number;
      options: Array<{ id: number; name: string; price: number; hpp: number; sortOrder: number }>;
    }> = [];

    for (const group of (groups ?? [])) {
      const grResult = await query<{ insertId: number }>(
        'INSERT INTO variantGroups (productId, name, sortOrder) VALUES (?, ?, ?)',
        [productId, group.name, group.sortOrder ?? 0]
      );
      const groupId = (grResult as any).insertId as number;
      const savedOptions = [];

      for (const opt of (group.options ?? [])) {
        const opResult = await query<{ insertId: number }>(
          'INSERT INTO variantOptions (variantGroupId, productId, name, price, hpp, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
          [groupId, productId, opt.name, Number(opt.price) || 0, Number(opt.hpp) || 0, opt.sortOrder ?? 0]
        );
        savedOptions.push({
          id: (opResult as any).insertId,
          name: opt.name,
          price: Number(opt.price) || 0,
          hpp: Number(opt.hpp) || 0,
          sortOrder: opt.sortOrder ?? 0,
        });
      }
      savedGroups.push({ id: groupId, name: group.name, sortOrder: group.sortOrder ?? 0, options: savedOptions });
    }

    // 4. Ambil storeId dari produk, lalu broadcast HANYA ke store itu
    const storeRows = await query<Array<{ storeId: number | null }>>(
      'SELECT storeId FROM products WHERE id = ? LIMIT 1', [productId]
    );
    const storeId = (storeRows as Array<{ storeId: number | null }>)[0]?.storeId ?? undefined;
    broadcastChange('variants-replaced', 'upsert', { productId, groups: savedGroups }, storeId);

    res.status(201).json({ ok: true, productId, groups: savedGroups });
  } catch (err) {
    console.error('[POST /variant-groups/replace-by-sku]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /variant-groups/by-product/:productId — legacy
router.delete('/by-product/:productId', async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) { res.status(400).json({ error: 'productId tidak valid' }); return; }
    await query('DELETE FROM variantGroups WHERE productId = ?', [productId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /variant-groups/by-product]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /variant-groups — legacy single upsert
router.post('/', async (req: Request, res: Response) => {
  try {
    const v = req.body as any;
    let serverId: number;
    if (v.id) {
      await query(
        `INSERT INTO variantGroups (id, productId, name, sortOrder)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           productId = VALUES(productId), name = VALUES(name),
           sortOrder = VALUES(sortOrder), updatedAt = NOW()`,
        [v.id, v.productId, v.name, v.sortOrder ?? 0]
      );
      serverId = v.id;
    } else {
      const result = await query<{ insertId: number }>(
        `INSERT INTO variantGroups (productId, name, sortOrder) VALUES (?, ?, ?)`,
        [v.productId, v.name, v.sortOrder ?? 0]
      );
      serverId = (result as any).insertId;
    }
    broadcastChange('variantGroups', 'upsert', { ...v, id: serverId }, undefined);
    res.status(201).json({ ok: true, serverId });
  } catch (err) {
    console.error('[POST /variant-groups]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
