import dbPromise from "#db/promise";
import { getGstRate } from "../../subscription/utils/gstCalculation.js";

const DEFAULT_CATEGORIES = [
  {
    key: "customer_app_marketing",
    label: "Customer App Marketing",
    sort: 1,
    allowExpense: true,
    rate: 8.15,
    percentOf: "gross",
  },
  {
    key: "marketing_cost",
    label: "Marketing Cost",
    sort: 2,
    allowExpense: true,
    rate: 42.05,
    percentOf: "gross",
  },
  {
    key: "commission_allocated",
    label: "Commission",
    sort: 3,
    allowExpense: true,
    rate: 20.85,
    percentOf: "gross",
  },
  {
    key: "partner_marketing",
    label: "Partner Marketing - Project Partner",
    sort: 4,
    allowExpense: true,
    rate: 3.9,
    percentOf: "gross",
  },
  {
    key: "overheads",
    label: "Overheads",
    sort: 5,
    allowExpense: true,
    rate: 8.15,
    percentOf: "gross",
  },
  {
    key: "video_content",
    label: "Video Content",
    sort: 6,
    allowExpense: true,
    rate: 0,
    percentOf: "gross",
  },
  {
    key: "razorpay_fee",
    label: "Razorpay Fee",
    sort: 7,
    allowExpense: false,
    rate: 2,
    percentOf: "ex_gst",
    isSystem: true,
    calculationType: "razorpay",
  },
];

const DEFAULT_SETTINGS = {
  razorpay_fee_rate: "2",
  gst_rate: String(getGstRate()),
};

let schemaReady = null;

async function ensureColumn(table, column, ddl) {
  try {
    await dbPromise.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
}

export async function ensureFinanceSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await dbPromise.query(`
      CREATE TABLE IF NOT EXISTS finance_cost_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_key VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(128) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        allow_expense_entry TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbPromise.query(`
      CREATE TABLE IF NOT EXISTS finance_allocation_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        percent_of ENUM('gross', 'ex_gst') NOT NULL DEFAULT 'gross',
        rate DECIMAL(10, 4) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_finance_alloc_category (category_id)
      )
    `);

    await dbPromise.query(`
      CREATE TABLE IF NOT EXISTS finance_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        amount DECIMAL(14, 2) NOT NULL,
        expense_date DATE NOT NULL,
        note VARCHAR(512) NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_finance_expense_date (expense_date),
        KEY idx_finance_expense_category (category_id)
      )
    `);

    await dbPromise.query(`
      CREATE TABLE IF NOT EXISTS finance_settings (
        setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await ensureColumn(
      "finance_cost_categories",
      "is_system",
      "TINYINT(1) NOT NULL DEFAULT 0",
    );
    await ensureColumn(
      "finance_cost_categories",
      "calculation_type",
      "ENUM('percent', 'razorpay') NOT NULL DEFAULT 'percent'",
    );

    for (const cat of DEFAULT_CATEGORIES) {
      const [existing] = await dbPromise.query(
        `SELECT id FROM finance_cost_categories WHERE category_key = ? LIMIT 1`,
        [cat.key],
      );
      let categoryId = existing[0]?.id;
      if (!categoryId) {
        const [ins] = await dbPromise.query(
          `INSERT INTO finance_cost_categories
           (category_key, label, sort_order, allow_expense_entry, is_system, calculation_type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            cat.key,
            cat.label,
            cat.sort,
            cat.allowExpense ? 1 : 0,
            cat.isSystem ? 1 : 0,
            cat.calculationType || "percent",
          ],
        );
        categoryId = ins.insertId;
      } else if (cat.isSystem) {
        await dbPromise.query(
          `UPDATE finance_cost_categories
           SET is_system = 1, calculation_type = 'razorpay', allow_expense_entry = 0
           WHERE category_key = ?`,
          [cat.key],
        );
      }

      const [ruleRow] = await dbPromise.query(
        `SELECT id FROM finance_allocation_rules WHERE category_id = ? LIMIT 1`,
        [categoryId],
      );
      if (!ruleRow.length) {
        await dbPromise.query(
          `INSERT INTO finance_allocation_rules (category_id, percent_of, rate)
           VALUES (?, ?, ?)`,
          [categoryId, cat.percentOf, cat.rate],
        );
      }
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await dbPromise.query(
        `INSERT INTO finance_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_key = setting_key`,
        [key, value],
      );
    }
  })();

  return schemaReady;
}
