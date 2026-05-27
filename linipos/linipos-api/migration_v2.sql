-- ============================================================
-- LINI POS — Database Migration v2: Multi-Tenant Isolation
-- Jalankan script ini SATU KALI di server MySQL
-- via phpMyAdmin atau: mysql -u root -p linipos_db < migration_v2.sql
-- ============================================================

-- Gunakan database yang benar (sesuaikan nama jika beda)
-- USE linipos_db;

-- ============================================================
-- STEP 1: Tambah kolom storeId ke tabel users & tabel lainnya (Compatible with older MySQL)
-- ============================================================
DROP PROCEDURE IF EXISTS add_storeId_column;
DELIMITER //
CREATE PROCEDURE add_storeId_column(IN tbl_name VARCHAR(100), IN after_col VARCHAR(100))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = tbl_name
      AND COLUMN_NAME = 'storeId'
  ) THEN
    SET @sql_cmd = CONCAT('ALTER TABLE ', tbl_name, ' ADD COLUMN storeId INT UNSIGNED NULL AFTER ', after_col);
    PREPARE stmt FROM @sql_cmd;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    SET @idx_cmd = CONCAT('ALTER TABLE ', tbl_name, ' ADD INDEX idx_', tbl_name, '_storeId (storeId)');
    PREPARE stmt2 FROM @idx_cmd;
    EXECUTE stmt2;
    DEALLOCATE PREPARE stmt2;
  END IF;
END //
DELIMITER ;

-- Jalankan untuk users
CALL add_storeId_column('users', 'isActive');

-- Jalankan untuk tabel lainnya yang terpengaruh multi-tenant
CALL add_storeId_column('products', 'isActive');
CALL add_storeId_column('categories', 'icon');
CALL add_storeId_column('suppliers', 'notes');
CALL add_storeId_column('paymentMethods', 'isDefault');
CALL add_storeId_column('transactions', 'status');
CALL add_storeId_column('shifts', 'id');
CALL add_storeId_column('storeSettings', 'id');

DROP PROCEDURE IF EXISTS add_storeId_column;

-- ============================================================
-- STEP 2: Assign SEMUA users yang ada ke store pertama
-- (agar tidak kehilangan data user yang sudah ada)
-- ============================================================
UPDATE users
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

-- ============================================================
-- STEP 3: Assign semua data NULL storeId ke store pertama
-- (products, categories, suppliers, paymentMethods, transactions)
-- ============================================================
UPDATE products
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

UPDATE categories
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

UPDATE suppliers
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

UPDATE paymentMethods
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

UPDATE transactions
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

UPDATE shifts
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL;

UPDATE storeSettings
SET storeId = (SELECT MIN(id) FROM stores)
WHERE storeId IS NULL OR storeId = 0;

-- ============================================================
-- STEP 4: Verifikasi — cek apakah masih ada NULL storeId
-- (Semua query ini harus return 0 row)
-- ============================================================
SELECT 'users dengan storeId NULL:' AS check_table, COUNT(*) AS jumlah FROM users WHERE storeId IS NULL;
SELECT 'products dengan storeId NULL:' AS check_table, COUNT(*) AS jumlah FROM products WHERE storeId IS NULL;
SELECT 'categories dengan storeId NULL:' AS check_table, COUNT(*) AS jumlah FROM categories WHERE storeId IS NULL;

-- ============================================================
-- STEP 5: Lihat daftar store yang ada
-- ============================================================
SELECT id, accountId, storeName FROM stores ORDER BY id;
