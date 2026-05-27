import { Router, Request, Response } from 'express';
import { query } from '../db';
import { broadcastChange } from '../socket';

const router = Router();

/**
 * POST /categories — upsert dengan ownership check KETAT.
 * Jika id dikirim: cek dulu storeId-nya cocok, baru update.
 * Jika id tidak ada: insert baru (server assign id).
 * TIDAK pernah overwrite data milik store lain.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const c = req.body as any;
    const storeId = req.user?.storeId ?? null;

    if (!storeId) {
      res.status(403).json({ error: 'storeId tidak ditemukan di token' });
      return;
    }

    let resultId: number;

    if (c.id) {
      // Cek apakah record ini milik store yang sama
      const existing = await query<Array<{ id: number; storeId: number | null }>>(
        'SELECT id, storeId FROM categories WHERE id = ? LIMIT 1', [c.id]
      );
      const existingRow = (existing as Array<{ id: number; storeId: number | null }>)[0];

      if (!existingRow) {
        // Belum ada — insert dengan id spesifik (kasus restore/sync)
        await query(
          `INSERT INTO categories (id, name, color, icon, isDeleted, deletedAt, createdAt, storeId)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
          [c.id, c.name, c.color ?? '#95A5A6', c.icon ?? '', c.isDeleted ?? 0,
           c.deletedAt ? new Date(c.deletedAt) : null, storeId]
        );
        resultId = c.id;
      } else if (existingRow.storeId === storeId || existingRow.storeId === null) {
        // Record milik store ini — aman untuk update
        await query(
          `UPDATE categories SET
             name = ?, color = ?, icon = ?, isDeleted = ?, deletedAt = ?,
             updatedAt = NOW(), storeId = ?
           WHERE id = ? AND (storeId = ? OR storeId IS NULL)`,
          [c.name, c.color ?? '#95A5A6', c.icon ?? '', c.isDeleted ?? 0,
           c.deletedAt ? new Date(c.deletedAt) : null, storeId, c.id, storeId]
        );
        resultId = c.id;
      } else {
        // Record milik store LAIN — tolak, insert baru tanpa id
        const newResult = await query<any>(
          `INSERT INTO categories (name, color, icon, isDeleted, createdAt, storeId)
           VALUES (?, ?, ?, ?, NOW(), ?)`,
          [c.name, c.color ?? '#95A5A6', c.icon ?? '', c.isDeleted ?? 0, storeId]
        );
        resultId = (newResult as any).insertId;
      }
    } else {
      // Tidak ada id — insert baru, server assign id
      const newResult = await query<any>(
        `INSERT INTO categories (name, color, icon, isDeleted, createdAt, storeId)
         VALUES (?, ?, ?, ?, NOW(), ?)`,
        [c.name, c.color ?? '#95A5A6', c.icon ?? '', c.isDeleted ?? 0, storeId]
      );
      resultId = (newResult as any).insertId;
    }

    broadcastChange('categories', 'upsert', { ...c, id: resultId, storeId }, storeId);
    res.status(201).json({ ok: true, id: resultId });
  } catch (err) {
    console.error('[POST /categories]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /categories/batch — batch upsert dengan ownership check.
 * Dipakai saat restore/pushAllData.
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { categories } = req.body as { categories: any[] };
    const storeId = req.user?.storeId ?? null;

    if (!storeId) {
      res.status(403).json({ error: 'storeId tidak ditemukan di token' });
      return;
    }

    if (!categories?.length) { res.json({ upserted: 0 }); return; }

    for (const c of categories) {
      if (c.id) {
        const existing = await query<Array<{ id: number; storeId: number | null }>>(
          'SELECT id, storeId FROM categories WHERE id = ? LIMIT 1', [c.id]
        );
        const existingRow = (existing as Array<{ id: number; storeId: number | null }>)[0];

        if (!existingRow) {
          await query(
            `INSERT INTO categories (id, name, color, icon, isDeleted, deletedAt, createdAt, storeId)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [c.id, c.name, c.color ?? '#95A5A6', c.icon ?? '', c.isDeleted ?? 0,
             c.deletedAt ? new Date(c.deletedAt) : null, storeId]
          );
        } else if (existingRow.storeId === storeId || existingRow.storeId === null) {
          await query(
            `UPDATE categories SET name=?, color=?, icon=?, isDeleted=?, deletedAt=?, updatedAt=NOW(), storeId=?
             WHERE id=? AND (storeId=? OR storeId IS NULL)`,
            [c.name, c.color ?? '#95A5A6', c.icon ?? '', c.isDeleted ?? 0,
             c.deletedAt ? new Date(c.deletedAt) : null, storeId, c.id, storeId]
          );
        }
        // else: milik store lain — skip
      }
    }

    broadcastChange('categories', 'upsert', { batch: true, storeId }, storeId);
    res.json({ upserted: categories.length });
  } catch (err) {
    console.error('[POST /categories/batch]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /categories/:id — hanya bisa hapus milik store sendiri
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const storeId = req.user?.storeId ?? null;

    if (!storeId) { res.status(403).json({ error: 'Unauthorized' }); return; }

    await query(
      'UPDATE categories SET isDeleted=1, deletedAt=NOW() WHERE id=? AND storeId=?',
      [id, storeId]
    );
    broadcastChange('categories', 'delete', { id, storeId }, storeId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /categories/:id]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
