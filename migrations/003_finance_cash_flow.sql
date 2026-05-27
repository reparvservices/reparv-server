-- Finance / cash flow tables (also applied via ensureFinanceSchema on API boot)

CREATE TABLE IF NOT EXISTS finance_cost_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_key VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  allow_expense_entry TINYINT(1) NOT NULL DEFAULT 1,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  calculation_type ENUM('percent', 'razorpay') NOT NULL DEFAULT 'percent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_allocation_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  percent_of ENUM('gross', 'ex_gst') NOT NULL DEFAULT 'gross',
  rate DECIMAL(10, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_finance_alloc_category (category_id),
  CONSTRAINT fk_finance_alloc_category
    FOREIGN KEY (category_id) REFERENCES finance_cost_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS finance_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  amount DECIMAL(14, 2) NOT NULL,
  expense_date DATE NOT NULL,
  note VARCHAR(512) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_finance_expense_date (expense_date),
  KEY idx_finance_expense_category (category_id),
  CONSTRAINT fk_finance_expense_category
    FOREIGN KEY (category_id) REFERENCES finance_cost_categories(id)
);

CREATE TABLE IF NOT EXISTS finance_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
