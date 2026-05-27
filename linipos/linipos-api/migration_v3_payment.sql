CREATE TABLE IF NOT EXISTS paymentMethodDefaults (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type      VARCHAR(30) NOT NULL UNIQUE,
  name      VARCHAR(50) NOT NULL,
  icon      VARCHAR(20) NOT NULL DEFAULT 'credit-card',
  sortOrder INT NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO paymentMethodDefaults (type, name, icon, sortOrder) VALUES
  ('tunai',    'Tunai',         'banknote',    1),
  ('transfer', 'Transfer Bank', 'building',    2),
  ('qris',     'QRIS',          'smartphone',  3),
  ('debit',    'Kartu Debit',   'credit-card', 4),
  ('kredit',   'Kartu Kredit',  'credit-card', 5),
  ('ewallet',  'E-Wallet',      'wallet',      6);

CREATE TABLE IF NOT EXISTS paymentMethodConfigs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  storeId     INT UNSIGNED NOT NULL,
  type        VARCHAR(30) NOT NULL,
  displayName VARCHAR(100) NULL,
  isActive    TINYINT(1) NOT NULL DEFAULT 1,
  createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_store_type (storeId, type),
  INDEX idx_storeId (storeId),
  INDEX idx_type (type)
);

-- Auto-seed: tunai/transfer/qris aktif, debit/kredit/ewallet nonaktif
INSERT IGNORE INTO paymentMethodConfigs (storeId, type, isActive)
SELECT s.id, d.type,
  CASE WHEN d.type IN ('tunai', 'transfer', 'qris') THEN 1 ELSE 0 END
FROM stores s
CROSS JOIN paymentMethodDefaults d;

SELECT 'paymentMethodDefaults' AS tabel, COUNT(*) AS jumlah FROM paymentMethodDefaults
UNION ALL
SELECT 'paymentMethodConfigs', COUNT(*) FROM paymentMethodConfigs;
