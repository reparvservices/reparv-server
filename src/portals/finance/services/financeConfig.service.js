import dbPromise from "#db/promise";
import { getGstRate } from "../../subscription/utils/gstCalculation.js";
import { ensureFinanceSchema } from "./financeSchema.service.js";

function parsePercentRate(rawRate) {
  const rate = Number(rawRate);
  if (!Number.isFinite(rate)) return 0;
  if (rate < 0) return 0;
  if (rate > 100) return 100;
  return Number(rate.toFixed(2));
}

function mapCategoryRow(c) {
  return {
    id: c.id,
    key: c.category_key,
    label: c.label,
    sortOrder: c.sort_order,
    isSystem: Boolean(c.is_system),
    calculationType: c.calculation_type || "percent",
    allowExpenseEntry: Boolean(c.allow_expense_entry),
    allocation: {
      ruleId: c.rule_id,
      percentOf: c.percent_of || "gross",
      rate: Number(c.rate) || 0,
    },
  };
}

function slugifyKey(label) {
  const base = String(label || "category")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 56);
  return base || "category";
}

async function uniqueCategoryKey(baseKey) {
  let key = baseKey;
  let n = 1;
  for (;;) {
    const [rows] = await dbPromise.query(
      `SELECT id FROM finance_cost_categories WHERE category_key = ? LIMIT 1`,
      [key],
    );
    if (!rows.length) return key;
    n += 1;
    key = `${baseKey}_${n}`.slice(0, 64);
  }
}

export async function getFinanceSettings() {
  await ensureFinanceSchema();
  const [rows] = await dbPromise.query(
    `SELECT setting_key, setting_value FROM finance_settings`,
  );
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    razorpayFeeRate: Number(map.razorpay_fee_rate ?? 2),
    gstRate: Number(map.gst_rate ?? getGstRate()),
  };
}

export async function updateFinanceSettings({ razorpayFeeRate, gstRate } = {}) {
  await ensureFinanceSchema();
  if (razorpayFeeRate != null) {
    await dbPromise.query(
      `INSERT INTO finance_settings (setting_key, setting_value)
       VALUES ('razorpay_fee_rate', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [String(razorpayFeeRate)],
    );
  }
  if (gstRate != null) {
    await dbPromise.query(
      `INSERT INTO finance_settings (setting_key, setting_value)
       VALUES ('gst_rate', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [String(gstRate)],
    );
  }
  return getFinanceSettings();
}

export async function getFinanceConfig() {
  await ensureFinanceSchema();
  const settings = await getFinanceSettings();
  const [categories] = await dbPromise.query(
    `SELECT c.id, c.category_key, c.label, c.sort_order, c.is_active, c.is_system,
            c.calculation_type, c.allow_expense_entry,
            r.id AS rule_id, r.percent_of, r.rate
     FROM finance_cost_categories c
     LEFT JOIN finance_allocation_rules r ON r.category_id = c.id
     WHERE c.is_active = 1
     ORDER BY c.sort_order ASC, c.id ASC`,
  );

  return {
    settings,
    categories: categories.map(mapCategoryRow),
  };
}

export async function createCostCategory(body = {}) {
  await ensureFinanceSchema();
  const label = String(body.label || "").trim();
  if (!label) throw new Error("Category label is required");

  const [maxRow] = await dbPromise.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS mx FROM finance_cost_categories WHERE is_active = 1`,
  );
  const requestedSort = Number(body.sortOrder);
  const sortOrder = Number.isFinite(requestedSort)
    ? requestedSort
    : Number(maxRow[0]?.mx || 0) + 1;
  const baseKey = slugifyKey(body.key || label);
  const categoryKey = await uniqueCategoryKey(baseKey);

  const allowExpense =
    body.allowExpenseEntry !== false && body.allowExpenseEntry !== 0;
  const rate = parsePercentRate(body.rate ?? body.allocation?.rate ?? 0);
  const percentOf =
    body.percentOf === "ex_gst" || body.allocation?.percentOf === "ex_gst"
      ? "ex_gst"
      : "gross";

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO finance_cost_categories
       (category_key, label, sort_order, allow_expense_entry, is_system, calculation_type)
       VALUES (?, ?, ?, ?, 0, 'percent')`,
      [categoryKey, label, sortOrder, allowExpense ? 1 : 0],
    );
    await conn.query(
      `INSERT INTO finance_allocation_rules (category_id, percent_of, rate)
       VALUES (?, ?, ?)`,
      [ins.insertId, percentOf, rate],
    );
    await conn.commit();
    const config = await getFinanceConfig();
    const created = config.categories.find((c) => c.id === ins.insertId);
    return created || { id: ins.insertId, label, key: categoryKey };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteCostCategory(id) {
  await ensureFinanceSchema();
  const categoryId = Number(id);
  if (!categoryId) throw new Error("Invalid category id");

  const [rows] = await dbPromise.query(
    `SELECT id, is_system, label FROM finance_cost_categories WHERE id = ? AND is_active = 1`,
    [categoryId],
  );
  if (!rows.length) throw new Error("Category not found");
  if (rows[0].is_system) {
    throw new Error("System categories cannot be deleted");
  }

  const [expCount] = await dbPromise.query(
    `SELECT COUNT(*) AS cnt FROM finance_expenses WHERE category_id = ?`,
    [categoryId],
  );
  if (Number(expCount[0]?.cnt) > 0) {
    await dbPromise.query(
      `UPDATE finance_cost_categories SET is_active = 0 WHERE id = ?`,
      [categoryId],
    );
    return { deleted: true, soft: true, message: "Category hidden (has expense history)" };
  }

  await dbPromise.query(`DELETE FROM finance_allocation_rules WHERE category_id = ?`, [
    categoryId,
  ]);
  await dbPromise.query(`DELETE FROM finance_cost_categories WHERE id = ?`, [categoryId]);
  return { deleted: true, soft: false };
}

export async function updateAllocationRules(rules = [], settings = {}) {
  await ensureFinanceSchema();

  for (const rule of rules) {
    if (!rule.categoryId) continue;
    const rate = parsePercentRate(rule.rate);
    const percentOf = rule.percentOf === "ex_gst" ? "ex_gst" : "gross";

    await dbPromise.query(
      `INSERT INTO finance_allocation_rules (category_id, percent_of, rate)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE percent_of = VALUES(percent_of), rate = VALUES(rate)`,
      [rule.categoryId, percentOf, rate],
    );

    const updates = [];
    const params = [];
    if (rule.label) {
      updates.push("label = ?");
      params.push(String(rule.label).trim());
    }
    if (rule.allowExpenseEntry !== undefined) {
      const [cat] = await dbPromise.query(
        `SELECT is_system FROM finance_cost_categories WHERE id = ?`,
        [rule.categoryId],
      );
      if (!cat[0]?.is_system) {
        updates.push("allow_expense_entry = ?");
        params.push(rule.allowExpenseEntry ? 1 : 0);
      }
    }
    if (rule.sortOrder != null) {
      updates.push("sort_order = ?");
      params.push(Number(rule.sortOrder));
    }
    if (updates.length) {
      params.push(rule.categoryId);
      await dbPromise.query(
        `UPDATE finance_cost_categories SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );
    }
  }

  await updateFinanceSettings(settings);
  return getFinanceConfig();
}
