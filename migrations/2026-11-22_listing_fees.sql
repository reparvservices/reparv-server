-- Paid listings for website users: 1 free listing, then a fee set in the admin panel.
-- Apply once per environment. Safe to re-run except the ALTER at the bottom (it errors if the
-- column already exists; that is harmless, skip it then).
-- Until this is applied the feature is simply OFF: the server treats missing tables as "disabled".

-- One row (id = 1): the master switch and the free allowance.
CREATE TABLE IF NOT EXISTS listing_fee_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  free_per_user INT NOT NULL DEFAULT 1,
  default_fee INT NOT NULL DEFAULT 0,            -- INR, excluding GST; used when no rule matches
  go_live_at DATETIME NULL,                      -- set the first time the admin switches it on
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO listing_fee_settings (id) VALUES (1);

-- Fee per property type, optionally different for Sell / Rent. Amounts exclude GST (whole rupees).
CREATE TABLE IF NOT EXISTS listing_fee_rules (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_type ENUM('Sell','Rent','Any') NOT NULL DEFAULT 'Any',
  property_category VARCHAR(60) NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lfr (listing_type, property_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ledger and audit trail. The free allowance is counted from kind = 'free' rows, so deleting a
-- listing never gives the user another free one.
CREATE TABLE IF NOT EXISTS listing_fee_payments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  property_id INT NOT NULL,
  kind ENUM('free','waived','paid') NOT NULL,    -- waived = the configured fee was 0
  status ENUM('free','pending','paid') NOT NULL,
  base_amount INT NOT NULL DEFAULT 0,
  gst_amount INT NOT NULL DEFAULT 0,
  total_amount INT NOT NULL DEFAULT 0,
  razorpay_order_id VARCHAR(64) NULL,
  razorpay_payment_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  KEY idx_lfp_user (user_id, kind),
  KEY idx_lfp_property (property_id),
  KEY idx_lfp_order (razorpay_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 'free' | 'pending' | 'paid'. NULL = not applicable (partner / admin listings, and every row
-- that existed before the feature), so nothing existing changes.
ALTER TABLE properties ADD COLUMN fee_status VARCHAR(12) NULL;
