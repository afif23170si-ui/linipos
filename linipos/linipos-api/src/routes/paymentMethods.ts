import { Router, Request, Response } from 'express';
import { query } from '../db';
import { broadcastChange } from '../socket';

const router = Router();

/**
 * Helper: auto-seed payment method configs untuk store yang belum punya.
 * Dipanggil sebelum GET agar store baru selalu punya 6 config.
 */
async function ensureStorePaymentConfigs(storeId: number): Promise<void> {
  await query(
    `INSERT IGNORE INTO paymentMethodConfigs (storeId, type, isActive)
     SELECT ?, type, 1 FROM paymentMethodDefaults`,
    [storeId]
  );
}

/**
 * GET /payment-methods
 * Kembalikan daftar 6 metode pembayaran milik store ini.
 * Join defaults untuk nama/icon fallback.
 * Auto-seed jika belum ada.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const storeId = req.user?.storeId ?? null;
    if (!storeId) { res.status(403).json({ error: 'Unauthorized' }); return; }

    await ensureStorePaymentConfigs(storeId);

    const rows = await query<Array<Record<string, unknown>>>(
      `SELECT
         pmc.id,
         pmc.storeId,
         pmc.type,
         COALESCE(pmc.displayName, pmd.name) AS name,
         pmd.name                             AS defaultName,
         pmd.icon,
         pmc.isActive,
         pmd.sortOrder,
         pmc.updatedAt
       FROM paymentMethodConfigs pmc
       JOIN paymentMethodDefaults pmd ON pmc.type = pmd.type
       WHERE pmc.storeId = ?
       ORDER BY pmd.sortOrder`,
      [storeId]
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /payment-methods]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /payment-methods/:type
 * Update displayName dan/atau isActive untuk satu metode.
 * Hanya untuk store sendiri — tidak bisa ubah milik store lain.
 */
router.put('/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params as { type: string };
    const storeId = req.user?.storeId ?? null;
    if (!storeId) { res.status(403).json({ error: 'Unauthorized' }); return; }

    const { displayName, isActive } = req.body as {
      displayName?: string | null;
      isActive?: number;
    };

    // Pastikan config ada (auto-seed jika perlu)
    await ensureStorePaymentConfigs(storeId);

    // Build update fields
    const fields: string[] = ['updatedAt = NOW()'];
    const values: unknown[] = [];

    if (displayName !== undefined) {
      // null atau string kosong = reset ke default name
      fields.push('displayName = ?');
      values.push(displayName?.trim() || null);
    }
    if (isActive !== undefined) {
      fields.push('isActive = ?');
      values.push(isActive ? 1 : 0);
    }

    values.push(storeId, type);

    await query(
      `UPDATE paymentMethodConfigs SET ${fields.join(', ')}
       WHERE storeId = ? AND type = ?`,
      values
    );

    // Ambil data terbaru untuk broadcast
    const updated = await query<Array<Record<string, unknown>>>(
      `SELECT pmc.id, pmc.storeId, pmc.type,
              COALESCE(pmc.displayName, pmd.name) AS name,
              pmd.icon, pmc.isActive, pmd.sortOrder
       FROM paymentMethodConfigs pmc
       JOIN paymentMethodDefaults pmd ON pmc.type = pmd.type
       WHERE pmc.storeId = ? AND pmc.type = ?`,
      [storeId, type]
    );

    const row = (updated as Array<Record<string, unknown>>)[0];
    broadcastChange('paymentMethods', 'upsert', row, storeId);
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[PUT /payment-methods/:type]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /payment-methods/batch-sync
 * Dipakai oleh sync pull untuk push semua configs sekaligus.
 * Hanya update, tidak create baru — create via ensureStorePaymentConfigs.
 */
router.post('/batch-sync', async (req: Request, res: Response) => {
  try {
    const storeId = req.user?.storeId ?? null;
    if (!storeId) { res.status(403).json({ error: 'Unauthorized' }); return; }

    const { configs } = req.body as {
      configs: Array<{ type: string; displayName?: string | null; isActive?: number }>;
    };

    await ensureStorePaymentConfigs(storeId);

    for (const cfg of (configs ?? [])) {
      await query(
        `UPDATE paymentMethodConfigs
         SET displayName = ?, isActive = ?, updatedAt = NOW()
         WHERE storeId = ? AND type = ?`,
        [cfg.displayName?.trim() || null, cfg.isActive ?? 1, storeId, cfg.type]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /payment-methods/batch-sync]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
