-- ============================================================
-- Lini POS — Auth System Migration (idempotent)
-- Run: mysql -u <user> -p <dbname> < migrations/002_auth_system.sql
-- ============================================================

-- ── accounts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255)  NOT NULL,
  passwordHash VARCHAR(255)  NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  createdAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── stores ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  accountId INT UNSIGNED  NOT NULL,
  storeName VARCHAR(200)  NOT NULL DEFAULT 'Toko Saya',
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stores_account FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_stores_accountId (accountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── users: tambah kolom storeId ──────────────────────────────
-- Gunakan stored procedure untuk idempoten (cek dulu sebelum ALTER)
DROP PROCEDURE IF EXISTS add_storeId_to_users;
DELIMITER //
CREATE PROCEDURE add_storeId_to_users()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'storeId'
  ) THEN
    ALTER TABLE users ADD COLUMN storeId INT UNSIGNED NULL AFTER role;
    ALTER TABLE users ADD INDEX idx_users_storeId (storeId);
  END IF;
END //
DELIMITER ;
CALL add_storeId_to_users();
DROP PROCEDURE IF EXISTS add_storeId_to_users;
