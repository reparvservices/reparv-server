-- Real-estate related advertisements (furniture, interiors, home loans, movers, ...)
-- managed from the admin panel and shown on the website home page
-- below "Verified Rental Properties".
--   city NULL      -> shown in every city
--   startDate/endDate NULL -> no limit on that side
CREATE TABLE IF NOT EXISTS advertisements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  advertiserName VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description VARCHAR(300) NULL,
  imageUrl VARCHAR(500) NOT NULL,
  ctaLabel VARCHAR(40) NULL,
  targetUrl VARCHAR(500) NULL,
  contactPhone VARCHAR(15) NULL,
  city VARCHAR(80) NULL,
  displayOrder INT NOT NULL DEFAULT 0,
  status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  startDate DATE NULL,
  endDate DATE NULL,
  clicks INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_advertisements_live (status, city, displayOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
