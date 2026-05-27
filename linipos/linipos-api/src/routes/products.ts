import { Router, Request, Response } from 'express';
import { pool, query } from '../db';
import { validate } from '../middleware/validate';
import { ProductSchema, ProductPartialSchema, ProductBatchSchema } from '../schemas/product.schemas';
import type { PoolConnection } from 'mysql2/promise';
import { broadcastChange } from '../socket';

const router = Router();

// GET /products
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const sql = includeDeleted
      ? 'SELECT * FROM products ORDER BY sortOrder ASC, id ASC'
      : 'SELECT * FROM products WHERE isDeleted = 0 ORDER BY sortOrder ASC, id ASC';
    const rows = await query(sql);
    res.json(rows);
  } catch (err) {
    console.error('[GET /products]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products — upsert by SKU, scoped to storeId
router.post('/', validate(ProductSchema), async (req: Request, res: Response) => {
  try {
    const p = req.body;
    const storeId = req.user?.storeId ?? null;
    const deletedAt = p.isDeleted === 1 ? new Date() : (p.deletedAt ?? null);

    await query(
      `INSERT INTO products
        (name, sku, categoryId, price, hpp, stock, unit, photo, description,
         unlimitedStock, barcode, sortOrder, isActive, isDeleted, deletedAt, createdAt, updatedAt, storeId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), categoryId = VALUES(categoryId), price = VALUES(price),
         hpp = VALUES(hpp), stock = VALUES(stock), unit = VALUES(unit),
         photo = VALUES(photo), description = VALUES(description),
         unlimitedStock = VALUES(unlimitedStock), barcode = VALUES(barcode),
         sortOrder = VALUES(sortOrder), isActive = VALUES(isActive),
         isDeleted = VALUES(isDeleted), deletedAt = VALUES(deletedAt), updatedAt = NOW(),
         storeId = COALESCE(storeId, VALUES(storeId))`,
      [p.name, p.sku, p.categoryId, p.price, p.hpp, p.stock, p.unit,
       p.photo ?? null, p.description ?? null, p.unlimitedStock ?? 0,
       p.barcode ?? null, p.sortOrder ?? 0, p.isActive ?? 1,
       p.isDeleted ?? 0, deletedAt, storeId]
    );

    const rows = await query<Array<{ id: number }>>(
      'SELECT id FROM products WHERE sku = ? LIMIT 1', [p.sku]
    );
    const result = { id: rows[0]?.id, sku: p.sku };
    broadcastChange('products', 'upsert', { ...p, id: result.id }, storeId);
    res.status(201).json(result);
  } catch (err) {
    console.error('[POST /products]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /products/:id — partial update
router.put('/:id', validate(ProductPartialSchema), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const updates = req.body;
    const storeId = req.user?.storeId ?? null;

    const existing = await query<Array<{ id: number }>>(
      'SELECT id FROM products WHERE id = ? LIMIT 1', [id]
    );
    if (!existing || (existing as Array<unknown>).length === 0) {
      res.status(404).json({ error: 'Produk tidak ditemukan' });
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const fieldMap: Record<string, string> = {
      name: 'name', sku: 'sku', categoryId: 'categoryId', price: 'price',
      hpp: 'hpp', stock: 'stock', unit: 'unit', photo: 'photo',
      description: 'description', unlimitedStock: 'unlimitedStock',
      barcode: 'barcode', sortOrder: 'sortOrder', isActive: 'isActive',
      isDeleted: 'isDeleted',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        fields.push(`${col} = ?`);
        values.push((updates as Record<string, unknown>)[key]);
      }
    }
    if (updates.isDeleted === 1) fields.push('deletedAt = NOW()');
    fields.push('updatedAt = NOW()');
    values.push(id);

    await query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
    broadcastChange('products', 'upsert', { id, ...updates }, storeId ?? undefined);
    res.json({ id, updated: true });
  } catch (err) {
    console.error('[PUT /products/:id]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products/batch — atomic bulk upsert
router.post('/batch', validate(ProductBatchSchema), async (req: Request, res: Response) => {
  const { products } = req.body as { products: Array<Record<string, unknown>> };
  let conn: PoolConnection | null = null;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const p of products) {
      const deletedAt = p['isDeleted'] === 1 ? new Date() : (p['deletedAt'] ?? null);
      await conn.execute(
        `INSERT INTO products
          (name, sku, categoryId, price, hpp, stock, unit, photo, description,
           unlimitedStock, barcode, sortOrder, isActive, isDeleted, deletedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), categoryId = VALUES(categoryId), price = VALUES(price),
           hpp = VALUES(hpp), stock = VALUES(stock), unit = VALUES(unit),
           photo = VALUES(photo), description = VALUES(description),
           unlimitedStock = VALUES(unlimitedStock), barcode = VALUES(barcode),
           sortOrder = VALUES(sortOrder), isActive = VALUES(isActive),
           isDeleted = VALUES(isDeleted), deletedAt = VALUES(deletedAt), updatedAt = NOW()`,
        [p['name'], p['sku'], p['categoryId'], p['price'], p['hpp'], p['stock'],
         p['unit'] ?? 'pcs', p['photo'] ?? null, p['description'] ?? null,
         p['unlimitedStock'] ?? 0, p['barcode'] ?? null, p['sortOrder'] ?? 0,
         p['isActive'] ?? 1, p['isDeleted'] ?? 0, deletedAt]
      );
    }

    await conn.commit();
    broadcastChange('products', 'upsert', { batch: true, count: products.length }, undefined);
    res.json({ upserted: products.length, failed: 0 });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('[POST /products/batch]', err);
    res.status(500).json({ error: 'Batch upsert gagal, semua perubahan dibatalkan' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
