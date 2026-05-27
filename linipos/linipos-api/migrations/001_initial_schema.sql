-- ============================================================
-- Lini POS — Initial Schema (idempotent)
-- Run: mysql -u <user> -p <dbname> < migrations/001_initial_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS linipos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE linipos_db;

-- users
CREATE TABLE IF NOT EXISTS users (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  pin        VARCHAR(64)   NOT NULL COMMENT 'SHA-256 hex of 4-digit PIN',
  role       ENUM('owner','kasir') NOT NULL DEFAULT 'kasir',
  isActive   TINYINT(1)    NOT NULL DEFAULT 1,
  createdAt  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- categories
CREATE TABLE IF NOT EXISTS categories (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100)  NOT NULL,
  color     VARCHAR(20)   NOT NULL DEFAULT '#95A5A6',
  icon      VARCHAR(10)   NOT NULL DEFAULT '📦',
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  isDeleted TINYINT(1)    NOT NULL DEFAULT 0,
  deletedAt DATETIME      NULL,
  INDEX idx_categories_isDeleted (isDeleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- products
CREATE TABLE IF NOT EXISTS products (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(255)  NOT NULL,
  sku            VARCHAR(100)  NOT NULL,
  categoryId     INT UNSIGNED  NOT NULL DEFAULT 0,
  price          DECIMAL(15,2) NOT NULL DEFAULT 0,
  hpp            DECIMAL(15,2) NOT NULL DEFAULT 0,
  stock          INT           NOT NULL DEFAULT 0,
  unit           VARCHAR(20)   NOT NULL DEFAULT 'pcs',
  photo          MEDIUMTEXT    NULL,
  description    TEXT          NULL,
  unlimitedStock TINYINT(1)    NOT NULL DEFAULT 0,
  barcode        VARCHAR(100)  NULL,
  sortOrder      INT           NOT NULL DEFAULT 0,
  isActive       TINYINT(1)    NOT NULL DEFAULT 1,
  createdAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  isDeleted      TINYINT(1)    NOT NULL DEFAULT 0,
  deletedAt      DATETIME      NULL,
  UNIQUE KEY uq_products_sku (sku),
  INDEX idx_products_categoryId (categoryId),
  INDEX idx_products_isDeleted (isDeleted),
  INDEX idx_products_isActive (isActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(200)  NOT NULL,
  phone     VARCHAR(50)   NOT NULL DEFAULT '',
  address   TEXT          NOT NULL DEFAULT '',
  notes     TEXT          NOT NULL DEFAULT '',
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  isDeleted TINYINT(1)    NOT NULL DEFAULT 0,
  deletedAt DATETIME      NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- stockIns
CREATE TABLE IF NOT EXISTS stockIns (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  productId  INT UNSIGNED  NOT NULL,
  supplierId INT UNSIGNED  NOT NULL DEFAULT 0,
  quantity   INT           NOT NULL DEFAULT 0,
  buyPrice   DECIMAL(15,2) NOT NULL DEFAULT 0,
  totalPrice DECIMAL(15,2) NOT NULL DEFAULT 0,
  date       DATETIME      NOT NULL,
  notes      TEXT          NOT NULL DEFAULT '',
  createdAt  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stockIns_productId (productId),
  INDEX idx_stockIns_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- stockOuts
CREATE TABLE IF NOT EXISTS stockOuts (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  productId INT UNSIGNED  NOT NULL,
  quantity  INT           NOT NULL DEFAULT 0,
  reason    VARCHAR(200)  NOT NULL DEFAULT '',
  date      DATETIME      NOT NULL,
  notes     TEXT          NOT NULL DEFAULT '',
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stockOuts_productId (productId),
  INDEX idx_stockOuts_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- hppHistory
CREATE TABLE IF NOT EXISTS hppHistory (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  productId INT UNSIGNED  NOT NULL,
  oldHpp    DECIMAL(15,2) NOT NULL DEFAULT 0,
  newHpp    DECIMAL(15,2) NOT NULL DEFAULT 0,
  source    ENUM('stock_in','manual') NOT NULL,
  date      DATETIME      NOT NULL,
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hppHistory_productId (productId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- paymentMethods
CREATE TABLE IF NOT EXISTS paymentMethods (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100)  NOT NULL,
  category  VARCHAR(50)   NOT NULL DEFAULT 'tunai',
  isDefault TINYINT(1)    NOT NULL DEFAULT 0,
  createdAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- transactions
CREATE TABLE IF NOT EXISTS transactions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subtotal        DECIMAL(15,2) NOT NULL DEFAULT 0,
  discountType    ENUM('percentage','nominal') NULL,
  discountValue   DECIMAL(15,2) NOT NULL DEFAULT 0,
  discountAmount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  total           DECIMAL(15,2) NOT NULL DEFAULT 0,
  paymentMethodId INT UNSIGNED  NOT NULL DEFAULT 0,
  paymentAmount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  `change`        DECIMAL(15,2) NOT NULL DEFAULT 0,
  profit          DECIMAL(15,2) NOT NULL DEFAULT 0,
  date            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  receiptNumber   VARCHAR(50)   NOT NULL,
  status          ENUM('open','completed') NOT NULL DEFAULT 'completed',
  type            ENUM('sale','refund')    NOT NULL DEFAULT 'sale',
  refundOf        VARCHAR(50)   NULL,
  refundReason    TEXT          NULL,
  orderNumber     VARCHAR(100)  NULL,
  customerName    VARCHAR(200)  NULL,
  tableNumber     VARCHAR(50)   NULL,
  remarks         TEXT          NULL,
  openedAt        DATETIME      NULL,
  closedAt        DATETIME      NULL,
  userId          INT UNSIGNED  NULL,
  userName        VARCHAR(100)  NULL,
  shiftId         INT UNSIGNED  NULL,
  createdAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transactions_receiptNumber (receiptNumber),
  INDEX idx_transactions_date (date),
  INDEX idx_transactions_status (status),
  INDEX idx_transactions_userId (userId),
  INDEX idx_transactions_shiftId (shiftId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- transactionItems
CREATE TABLE IF NOT EXISTS transactionItems (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transactionId   INT UNSIGNED  NOT NULL,
  productId       INT UNSIGNED  NOT NULL DEFAULT 0,
  productName     VARCHAR(255)  NOT NULL,
  quantity        INT           NOT NULL DEFAULT 1,
  price           DECIMAL(15,2) NOT NULL DEFAULT 0,
  hpp             DECIMAL(15,2) NOT NULL DEFAULT 0,
  discountType    ENUM('percentage','nominal') NULL,
  discountValue   DECIMAL(15,2) NOT NULL DEFAULT 0,
  discountAmount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  subtotal        DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes           TEXT          NULL,
  variantOptionId INT UNSIGNED  NULL,
  variantName     VARCHAR(100)  NULL,
  createdAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_txItems_transactionId (transactionId),
  INDEX idx_txItems_productId (productId),
  CONSTRAINT fk_txItems_transaction
    FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- variantGroups
CREATE TABLE IF NOT EXISTS variantGroups (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  productId INT UNSIGNED NOT NULL,
  name      VARCHAR(100) NOT NULL,
  sortOrder INT          NOT NULL DEFAULT 0,
  createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_variantGroups_productId (productId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- variantOptions
CREATE TABLE IF NOT EXISTS variantOptions (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  variantGroupId INT UNSIGNED  NOT NULL,
  productId      INT UNSIGNED  NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  price          DECIMAL(15,2) NOT NULL DEFAULT 0,
  hpp            DECIMAL(15,2) NOT NULL DEFAULT 0,
  sortOrder      INT           NOT NULL DEFAULT 0,
  createdAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_variantOptions_variantGroupId (variantGroupId),
  INDEX idx_variantOptions_productId (productId),
  CONSTRAINT fk_variantOptions_group
    FOREIGN KEY (variantGroupId) REFERENCES variantGroups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- shifts
CREATE TABLE IF NOT EXISTS shifts (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  userId      INT UNSIGNED  NOT NULL,
  userName    VARCHAR(100)  NOT NULL,
  openedAt    DATETIME      NOT NULL,
  closedAt    DATETIME      NULL,
  status      ENUM('open','closed') NOT NULL DEFAULT 'open',
  openingCash DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes       TEXT          NULL,
  createdAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shifts_userId (userId),
  INDEX idx_shifts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- storeSettings
CREATE TABLE IF NOT EXISTS storeSettings (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  storeName      VARCHAR(200) NOT NULL DEFAULT 'Toko Saya',
  address        TEXT         NOT NULL DEFAULT '',
  phone          VARCHAR(50)  NOT NULL DEFAULT '',
  receiptFooter  TEXT         NOT NULL DEFAULT '',
  onboardingDone TINYINT(1)   NOT NULL DEFAULT 0,
  lastBackupAt   DATETIME     NULL,
  themeColor     VARCHAR(20)  NULL,
  logo           MEDIUMTEXT   NULL,
  deviceId       VARCHAR(36)  NOT NULL DEFAULT '',
  createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
