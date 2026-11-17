-- Venue booking (villas, halls, farmhouses ...). Additive only: no existing table is changed.
-- Apply once per environment. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS venue_listings (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_role ENUM('project','sales','territory') NOT NULL DEFAULT 'project',
  owner_id INT NOT NULL,
  type ENUM('villa','hall','banquet','farmhouse','resort','lawn','other') NOT NULL DEFAULT 'villa',
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NULL,
  description TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  address VARCHAR(500) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  capacity INT NOT NULL DEFAULT 1,
  bedrooms INT NULL,
  amenities JSON NULL,
  rules TEXT NULL,
  images JSON NULL,
  price_model ENUM('night','slot') NOT NULL DEFAULT 'night',
  base_price INT NOT NULL,                       -- INR per night, or per slot
  weekend_price INT NULL,                        -- Fri/Sat night (night model) or weekend slot price
  cleaning_fee INT NOT NULL DEFAULT 0,
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  deposit_percent TINYINT NOT NULL DEFAULT 100,  -- % of total payable at booking (1-100)
  commission_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  cancellation_policy ENUM('flexible','moderate','strict') NOT NULL DEFAULT 'moderate',
  min_nights TINYINT NOT NULL DEFAULT 1,
  max_nights TINYINT NOT NULL DEFAULT 30,
  status ENUM('draft','pending','live','paused','rejected') NOT NULL DEFAULT 'draft',
  reject_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vl_owner (owner_role, owner_id),
  KEY idx_vl_status_city (status, city),
  KEY idx_vl_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS venue_blocked_dates (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_id INT NOT NULL,
  block_date DATE NOT NULL,
  slot ENUM('full','morning','evening') NOT NULL DEFAULT 'full',
  reason VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vbd (listing_id, block_date, slot),
  CONSTRAINT fk_vbd_listing FOREIGN KEY (listing_id) REFERENCES venue_listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS venue_bookings (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_ref VARCHAR(20) NOT NULL,
  listing_id INT NOT NULL,
  customer_id INT NOT NULL,                      -- guestUsers.id
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,                        -- exclusive (check-out day); start+1 for slot bookings
  slot ENUM('full','morning','evening') NOT NULL DEFAULT 'full',
  guests INT NOT NULL DEFAULT 1,
  subtotal INT NOT NULL,                         -- paise-free INR, before GST
  gst_amount INT NOT NULL DEFAULT 0,
  total_amount INT NOT NULL,
  payable_now INT NOT NULL,                      -- deposit (or full) charged via Razorpay
  amount_paid INT NOT NULL DEFAULT 0,
  commission_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  cancellation_policy ENUM('flexible','moderate','strict') NOT NULL DEFAULT 'moderate',
  status ENUM('held','confirmed','cancelled','completed','expired') NOT NULL DEFAULT 'held',
  hold_expires_at DATETIME NULL,
  razorpay_order_id VARCHAR(64) NULL,
  razorpay_payment_id VARCHAR(64) NULL,
  refund_amount INT NOT NULL DEFAULT 0,
  refund_id VARCHAR(64) NULL,
  cancel_reason VARCHAR(300) NULL,
  cancelled_by ENUM('customer','owner','admin','system') NULL,
  guest_name VARCHAR(150) NULL,
  guest_phone VARCHAR(20) NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vb_ref (booking_ref),
  UNIQUE KEY uq_vb_order (razorpay_order_id),
  KEY idx_vb_listing_dates (listing_id, start_date, end_date),
  KEY idx_vb_customer (customer_id),
  KEY idx_vb_status_hold (status, hold_expires_at),
  CONSTRAINT fk_vb_listing FOREIGN KEY (listing_id) REFERENCES venue_listings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
