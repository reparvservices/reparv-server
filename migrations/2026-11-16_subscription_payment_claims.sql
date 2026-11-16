-- One Razorpay payment may activate/extend a subscription exactly once.
-- The server creates this table on first use (CREATE TABLE IF NOT EXISTS), so applying this
-- file up front is optional and safe to run more than once.
CREATE TABLE IF NOT EXISTS subscription_payment_claims (
  payment_id VARCHAR(64) NOT NULL PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  user_id INT NOT NULL,
  status ENUM('processing','applied') NOT NULL DEFAULT 'processing',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
