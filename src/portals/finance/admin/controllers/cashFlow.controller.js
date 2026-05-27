import { getCashFlowReport } from "../../services/cashFlow.service.js";
import {
  getFinanceConfig,
  updateAllocationRules,
  createCostCategory,
  deleteCostCategory,
} from "../../services/financeConfig.service.js";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from "../../services/financeExpense.service.js";

export const getCashFlow = async (req, res) => {
  try {
    const data = await getCashFlowReport({
      year: req.query.year,
      month: req.query.month,
      from: req.query.from,
      to: req.query.to,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("getCashFlow:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to load cash flow report",
    });
  }
};

export const getAllocationConfig = async (req, res) => {
  try {
    const config = await getFinanceConfig();
    return res.json({ success: true, ...config });
  } catch (err) {
    console.error("getAllocationConfig:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to load finance config",
    });
  }
};

function normalizeRules(body) {
  if (body?.rules?.length) return body.rules;
  return (body?.categories || []).map((c) => ({
    categoryId: c.id ?? c.categoryId,
    label: c.label,
    rate: c.allocation?.rate ?? c.rate,
    percentOf: c.allocation?.percentOf ?? c.percentOf,
    allowExpenseEntry: c.allowExpenseEntry,
    sortOrder: c.sortOrder,
  }));
}

export const putAllocationConfig = async (req, res) => {
  try {
    const config = await updateAllocationRules(normalizeRules(req.body), {
        razorpayFeeRate: req.body?.razorpayFeeRate ?? req.body?.settings?.razorpayFeeRate,
        gstRate: req.body?.gstRate ?? req.body?.settings?.gstRate,
      },
    );
    return res.json({ success: true, ...config });
  } catch (err) {
    console.error("putAllocationConfig:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update finance config",
    });
  }
};

export const postCostCategory = async (req, res) => {
  try {
    const category = await createCostCategory(req.body);
    const config = await getFinanceConfig();
    return res.status(201).json({ success: true, category, ...config });
  } catch (err) {
    console.error("postCostCategory:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create category",
    });
  }
};

export const deleteCostCategoryHandler = async (req, res) => {
  try {
    const result = await deleteCostCategory(req.params.id);
    const config = await getFinanceConfig();
    return res.json({ success: true, ...result, ...config });
  } catch (err) {
    console.error("deleteCostCategory:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to delete category",
    });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const items = await listExpenses({
      from: req.query.from,
      to: req.query.to,
      categoryId: req.query.categoryId,
      limit: req.query.limit,
    });
    return res.json({ success: true, items });
  } catch (err) {
    console.error("getExpenses:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to list expenses",
    });
  }
};

export const postExpense = async (req, res) => {
  try {
    const createdBy = req.user?.id ?? req.user?.employeeId ?? null;
    const item = await createExpense(req.body, createdBy);
    return res.status(201).json({ success: true, item });
  } catch (err) {
    console.error("postExpense:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create expense",
    });
  }
};

export const patchExpense = async (req, res) => {
  try {
    const item = await updateExpense(req.params.id, req.body);
    return res.json({ success: true, item });
  } catch (err) {
    console.error("patchExpense:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to update expense",
    });
  }
};

export const removeExpense = async (req, res) => {
  try {
    await deleteExpense(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    console.error("removeExpense:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to delete expense",
    });
  }
};
