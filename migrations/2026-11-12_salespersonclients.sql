-- Clients added by sales partners from the sales mobile app
-- (POST /salesapp/client/add -> ClientController.addClient).
-- The table was missing in the database, so the endpoint failed with ER_NO_SUCH_TABLE.
-- Every field except salespersonId is optional because the controller does not validate them,
-- and the app sends free-text values, so they are stored as text.
CREATE TABLE IF NOT EXISTS salespersonclients (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  salespersonId INT NOT NULL,
  name VARCHAR(150) NULL,
  contact VARCHAR(30) NULL,
  email VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  budget VARCHAR(100) NULL,
  profession VARCHAR(150) NULL,
  status VARCHAR(50) NULL,
  purpose VARCHAR(150) NULL,
  income VARCHAR(100) NULL,
  paymentmode VARCHAR(100) NULL,
  timeperiod VARCHAR(100) NULL,
  decisionmaker VARCHAR(150) NULL,
  asset VARCHAR(255) NULL,
  extra TEXT NULL,
  remark TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_salespersonclients_salesperson (salespersonId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
