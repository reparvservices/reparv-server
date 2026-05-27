import dbPromise from "#db/promise";
import { ensureFinanceSchema } from "./financeSchema.service.js";

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function listExpenses({ from, to, categoryId, limit = 200 } = {}) {
  await ensureFinanceSchema();
  const clauses = ["1=1"];
  const params = [];

  if (from) {
    clauses.push("e.expense_date >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("e.expense_date <= ?");
    params.push(to);
  }
  if (categoryId) {
    clauses.push("e.category_id = ?");
    params.push(categoryId);
  }

  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  const [rows] = await dbPromise.query(
    `SELECT e.id, e.category_id, e.amount, e.expense_date, e.note, e.created_by, e.created_at,
            c.category_key, c.label AS category_label
     FROM finance_expenses e
     INNER JOIN finance_cost_categories c ON c.id = e.category_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT ?`,
    [...params, lim],
  );

  return rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    categoryKey: r.category_key,
    categoryLabel: r.category_label,
    amount: Number(r.amount) || 0,
    expenseDate: r.expense_date,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function createExpense(body, createdBy = null) {
  await ensureFinanceSchema();
  const categoryId = Number(body.categoryId ?? body.category_id);
  const amount = Number(body.amount);
  const expenseDate = parseDate(body.expenseDate ?? body.expense_date);
  const note = body.note ? String(body.note).trim().slice(0, 512) : null;

  if (!categoryId || !Number.isFinite(amount) || amount <= 0 || !expenseDate) {
    throw new Error("categoryId, positive amount, and expenseDate are required");
  }

  const [cat] = await dbPromise.query(
    `SELECT id, allow_expense_entry FROM finance_cost_categories WHERE id = ? AND is_active = 1`,
    [categoryId],
  );
  if (!cat.length) throw new Error("Invalid category");
  if (!cat[0].allow_expense_entry) {
    throw new Error("This category does not accept manual expense entries");
  }

  const [result] = await dbPromise.query(
    `INSERT INTO finance_expenses (category_id, amount, expense_date, note, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [categoryId, amount, expenseDate, note, createdBy],
  );

  const items = await listExpenses({ from: expenseDate, to: expenseDate, limit: 1 });
  const created = items.find((e) => e.id === result.insertId);
  return created || { id: result.insertId, categoryId, amount, expenseDate, note };
}

export async function updateExpense(id, body) {
  await ensureFinanceSchema();
  const expenseId = Number(id);
  if (!expenseId) throw new Error("Invalid expense id");

  const [existing] = await dbPromise.query(
    `SELECT * FROM finance_expenses WHERE id = ?`,
    [expenseId],
  );
  if (!existing.length) throw new Error("Expense not found");

  const categoryId = body.categoryId != null ? Number(body.categoryId) : existing[0].category_id;
  const amount = body.amount != null ? Number(body.amount) : Number(existing[0].amount);
  const expenseDate =
    body.expenseDate != null
      ? parseDate(body.expenseDate)
      : existing[0].expense_date;
  const note = body.note !== undefined ? (body.note ? String(body.note).trim() : null) : existing[0].note;

  if (!Number.isFinite(amount) || amount <= 0 || !expenseDate) {
    throw new Error("Invalid amount or date");
  }

  const [cat] = await dbPromise.query(
    `SELECT id, allow_expense_entry FROM finance_cost_categories WHERE id = ? AND is_active = 1`,
    [categoryId],
  );
  if (!cat.length) throw new Error("Invalid category");
  if (!cat[0].allow_expense_entry) {
    throw new Error("This category does not accept manual expense entries");
  }

  await dbPromise.query(
    `UPDATE finance_expenses
     SET category_id = ?, amount = ?, expense_date = ?, note = ?
     WHERE id = ?`,
    [categoryId, amount, expenseDate, note, expenseId],
  );

  const [rows] = await dbPromise.query(
    `SELECT e.id, e.category_id, e.amount, e.expense_date, e.note,
            c.category_key, c.label AS category_label
     FROM finance_expenses e
     INNER JOIN finance_cost_categories c ON c.id = e.category_id
     WHERE e.id = ?`,
    [expenseId],
  );
  const r = rows[0];
  return {
    id: r.id,
    categoryId: r.category_id,
    categoryKey: r.category_key,
    categoryLabel: r.category_label,
    amount: Number(r.amount),
    expenseDate: r.expense_date,
    note: r.note,
  };
}

export async function deleteExpense(id) {
  await ensureFinanceSchema();
  const [result] = await dbPromise.query(`DELETE FROM finance_expenses WHERE id = ?`, [
    Number(id),
  ]);
  if (!result.affectedRows) throw new Error("Expense not found");
  return { deleted: true };
}
