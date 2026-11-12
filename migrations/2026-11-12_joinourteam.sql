-- "Join Our Team" enquiries submitted from the website (/frontend/joinourteam/add).
-- The table was missing in the database, so the form failed with ER_NO_SUCH_TABLE.
CREATE TABLE IF NOT EXISTS joinourteam (
  jtid INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firstname VARCHAR(100) NOT NULL,
  lastname VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  updated_at DATETIME NULL,
  created_at DATETIME NULL,
  PRIMARY KEY (jtid),
  KEY idx_joinourteam_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
