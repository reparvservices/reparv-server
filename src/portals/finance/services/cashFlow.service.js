import dbPromise from "#db/promise";
import { REVENUE_PAYMENT_JOIN_SQL } from "../../subscription/utils/subscriptionAnalyticsSql.js";
import { splitGstFromTotal, getGstRate } from "../../subscription/utils/gstCalculation.js";
import { ensureFinanceSchema } from "./financeSchema.service.js";
import { getFinanceConfig } from "./financeConfig.service.js";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseYear(raw) {
  const y = Number.parseInt(raw, 10);
  const current = new Date().getFullYear();
  if (!Number.isFinite(y) || y < 2020 || y > current + 1) return current;
  return y;
}

function parseMonth(raw) {
  const m = Number.parseInt(raw, 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

let hasProjectCommissionColumnCache = null;

async function hasProjectCommissionColumn() {
  if (hasProjectCommissionColumnCache != null) {
    return hasProjectCommissionColumnCache;
  }
  const [rows] = await dbPromise.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'propertyfollowup'
       AND column_name = 'projectcommission'`,
  );
  hasProjectCommissionColumnCache = Number(rows[0]?.cnt || 0) > 0;
  return hasProjectCommissionColumnCache;
}

function buildRange({ year, month, from, to }) {
  if (from && to) {
    return {
      start: `${from} 00:00:00`,
      end: `${to} 23:59:59`,
      year: null,
      month: null,
    };
  }

  const y = parseYear(year);
  const m = parseMonth(month);
  if (m) {
    const lastDay = new Date(y, m, 0).getDate();
    return {
      start: `${y}-${String(m).padStart(2, "0")}-01 00:00:00`,
      end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")} 23:59:59`,
      year: y,
      month: m,
    };
  }

  return {
    start: `${y}-01-01 00:00:00`,
    end: `${y}-12-31 23:59:59`,
    year: y,
    month: null,
  };
}

async function subscriptionPaymentsInRange(start, end) {
  const [rows] = await dbPromise.query(
    `SELECT rp.id, rp.amount, COALESCE(rp.paid_at, rp.created_at) AS paid_at,
            sp.id AS plan_id, sp.plan_name, sp.price AS plan_price,
            gi.base_amount AS invoice_base, gi.cgst_amount, gi.sgst_amount, gi.igst_amount,
            gi.total_amount AS invoice_total
     FROM subscription_recurring_payments rp
     INNER JOIN user_subscriptions us ON us.id = rp.user_subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     LEFT JOIN subscription_gst_invoices gi ON gi.recurring_payment_id = rp.id
     WHERE rp.status IN ('captured', 'authorized')
       AND LOWER(us.status) NOT IN ('pending')
       AND COALESCE(rp.paid_at, rp.created_at) >= ?
       AND COALESCE(rp.paid_at, rp.created_at) <= ?`,
    [start, end],
  );
  return rows;
}

function splitPaymentAmount(row, gstRate) {
  const gross = Number(row.amount) || 0;
  if (row.invoice_base != null) {
    const base = Number(row.invoice_base) || 0;
    const gst =
      (Number(row.cgst_amount) || 0) +
      (Number(row.sgst_amount) || 0) +
      (Number(row.igst_amount) || 0);
    return { gross, base, gst: gst || round2(gross - base) };
  }
  const { base, gst } = splitGstFromTotal(gross, gstRate);
  return { gross, base, gst };
}

async function dealMetricsInRange(start, end) {
  const hasProjectCommission = await hasProjectCommissionColumn();
  const projectExpr = hasProjectCommission
    ? "COALESCE(SUM(pf.projectcommission), 0)"
    : "0";

  const [rows] = await dbPromise.query(
    `SELECT
       COALESCE(SUM(pf.dealamount), 0) AS deal_gmv,
       COALESCE(SUM(pf.reparvcommission), 0) AS reparv_commission,
       COALESCE(SUM(pf.salescommission), 0) AS sales_commission,
       COALESCE(SUM(pf.territorycommission), 0) AS territory_commission,
       ${projectExpr} AS project_commission,
       COALESCE(SUM(pf.totalcommission), 0) AS total_commission,
       COALESCE(SUM(pf.tds), 0) AS tds,
       COUNT(*) AS deal_count
     FROM propertyfollowup pf
     WHERE pf.status = 'Token'
       AND pf.created_at >= ?
       AND pf.created_at <= ?`,
    [start, end],
  );
  return rows[0] || {};
}

async function expensesByCategoryInRange(start, end) {
  const fromDate = start.slice(0, 10);
  const toDate = end.slice(0, 10);
  const [rows] = await dbPromise.query(
    `SELECT c.id, c.category_key, c.label,
            COALESCE(SUM(e.amount), 0) AS total
     FROM finance_cost_categories c
     LEFT JOIN finance_expenses e ON e.category_id = c.id
       AND e.expense_date >= ? AND e.expense_date <= ?
     WHERE c.is_active = 1 AND c.allow_expense_entry = 1
     GROUP BY c.id, c.category_key, c.label, c.sort_order
     ORDER BY c.sort_order`,
    [fromDate, toDate],
  );
  return rows.map((r) => ({
    categoryId: r.id,
    key: r.category_key,
    label: r.label,
    actual: round2(r.total),
  }));
}

function sumExpectedNonComputed(gross, exGst, categories, razorpayRate) {
  return round2(
    computeExpectedAllocations(gross, exGst, categories, razorpayRate)
      .filter((item) => !item.isComputed)
      .reduce((sum, item) => sum + (Number(item.expected) || 0), 0),
  );
}

async function monthlySubscriptionTotals(year, categories, razorpayRate) {
  const hasProjectCommission = await hasProjectCommissionColumn();
  const projectOutExpr = hasProjectCommission ? "COALESCE(SUM(pf.projectcommission), 0) +" : "";

  const yearStart = `${year}-01-01 00:00:00`;
  const yearEnd = `${year + 1}-01-01 00:00:00`;

  const [revRows] = await dbPromise.query(
    `SELECT MONTH(COALESCE(rp.paid_at, rp.created_at)) AS m,
            COALESCE(SUM(rp.amount), 0) AS gross
     ${REVENUE_PAYMENT_JOIN_SQL}
       AND COALESCE(rp.paid_at, rp.created_at) >= ?
       AND COALESCE(rp.paid_at, rp.created_at) < ?
     GROUP BY MONTH(COALESCE(rp.paid_at, rp.created_at))`,
    [yearStart, yearEnd],
  );

  const [gstRows] = await dbPromise.query(
    `SELECT MONTH(COALESCE(gi.paid_at, gi.invoice_date)) AS m,
            COALESCE(SUM(gi.cgst_amount + gi.sgst_amount + gi.igst_amount), 0) AS gst
     FROM subscription_gst_invoices gi
     WHERE COALESCE(gi.paid_at, gi.invoice_date) >= ?
       AND COALESCE(gi.paid_at, gi.invoice_date) < ?
     GROUP BY MONTH(COALESCE(gi.paid_at, gi.invoice_date))`,
    [yearStart, yearEnd],
  );

  const [dealRows] = await dbPromise.query(
    `SELECT MONTH(pf.created_at) AS m,
            COALESCE(SUM(pf.reparvcommission), 0) AS reparv_in,
            COALESCE(SUM(pf.salescommission), 0)
              + COALESCE(SUM(pf.territorycommission), 0)
              + ${projectOutExpr}
              COALESCE(SUM(pf.tds), 0) AS deal_out
     FROM propertyfollowup pf
     WHERE pf.status = 'Token'
       AND pf.created_at >= ? AND pf.created_at < ?
     GROUP BY MONTH(pf.created_at)`,
    [yearStart, yearEnd],
  );

  const [expRows] = await dbPromise.query(
    `SELECT MONTH(e.expense_date) AS m, COALESCE(SUM(e.amount), 0) AS exp
     FROM finance_expenses e
     WHERE e.expense_date >= DATE(?) AND e.expense_date < DATE(?)
     GROUP BY MONTH(e.expense_date)`,
    [yearStart, yearEnd],
  );

  const grossByMonth = Object.fromEntries(revRows.map((r) => [Number(r.m), Number(r.gross) || 0]));
  const gstByMonth = Object.fromEntries(gstRows.map((r) => [Number(r.m), Number(r.gst) || 0]));
  const dealInByMonth = Object.fromEntries(
    dealRows.map((r) => [Number(r.m), Number(r.reparv_in) || 0]),
  );
  const dealOutByMonth = Object.fromEntries(
    dealRows.map((r) => [Number(r.m), Number(r.deal_out) || 0]),
  );
  const expByMonth = Object.fromEntries(expRows.map((r) => [Number(r.m), Number(r.exp) || 0]));

  return MONTH_LABELS.map((label, idx) => {
    const month = idx + 1;
    const collections = round2(grossByMonth[month] || 0);
    const gst = round2(gstByMonth[month] || 0);
    const exGst = round2(collections - gst);
    const razorpay = round2(exGst * (razorpayRate / 100));
    const dealIn = round2(dealInByMonth[month] || 0);
    const dealOut = round2(dealOutByMonth[month] || 0);
    const loggedExp = round2(expByMonth[month] || 0);
    const expectedOtherOut = sumExpectedNonComputed(collections, exGst, categories, razorpayRate);
    const managedOtherOut = loggedExp > 0 ? loggedExp : expectedOtherOut;
    const categoryOut = round2(razorpay + managedOtherOut);
    const totalOut = round2(categoryOut + dealOut);
    const totalIn = round2(collections + dealIn);
    return {
      month,
      label,
      collections,
      exGst,
      gst,
      dealReparvCommission: dealIn,
      totalInflows: totalIn,
      razorpayEstimate: razorpay,
      expectedConfiguredExpenses: expectedOtherOut,
      dealCommissionsOut: dealOut,
      loggedExpenses: loggedExp,
      categoryOutflows: categoryOut,
      totalOutflows: totalOut,
      net: round2(totalIn - totalOut),
    };
  });
}

async function tierBreakdown(payments, gstRate) {
  const tiers = new Map();
  for (const row of payments) {
    const price = Number(row.plan_price) || Number(row.amount) || 0;
    const key = String(price);
    if (!tiers.has(key)) {
      tiers.set(key, {
        planPrice: price,
        planName: row.plan_name || "—",
        paymentCount: 0,
        gross: 0,
        base: 0,
        gst: 0,
      });
    }
    const t = tiers.get(key);
    const split = splitPaymentAmount(row, gstRate);
    t.paymentCount += 1;
    t.gross += split.gross;
    t.base += split.base;
    t.gst += split.gst;
  }

  return [...tiers.values()]
    .map((t) => ({
      planPrice: t.planPrice,
      planName: t.planName,
      paymentCount: t.paymentCount,
      gross: round2(t.gross),
      base: round2(t.base),
      gst: round2(t.gst),
      collection12Months: round2(t.gross * 12),
    }))
    .sort((a, b) => a.planPrice - b.planPrice);
}

function isRazorpayCategory(cat) {
  return cat.calculationType === "razorpay" || cat.key === "razorpay_fee";
}

function computeExpectedAllocations(gross, exGst, categories, razorpayRate) {
  return categories.map((cat) => {
    const rate = Number(cat.allocation?.rate) || 0;
    const percentOf = cat.allocation?.percentOf || "gross";
    let base = gross;
    if (percentOf === "ex_gst") base = exGst;
    if (isRazorpayCategory(cat)) {
      return {
        categoryId: cat.id,
        key: cat.key,
        label: cat.label,
        isComputed: true,
        allowExpenseEntry: false,
        expected: round2(exGst * (razorpayRate / 100)),
      };
    }
    return {
      categoryId: cat.id,
      key: cat.key,
      label: cat.label,
      isComputed: false,
      allowExpenseEntry: Boolean(cat.allowExpenseEntry),
      expected: round2(base * (rate / 100)),
    };
  });
}

export async function getCashFlowReport(query = {}) {
  await ensureFinanceSchema();
  const range = buildRange(query);
  const config = await getFinanceConfig();
  const settings = config.settings;
  const gstRate = settings.gstRate || getGstRate();
  const razorpayRate = settings.razorpayFeeRate || 2;

  const payments = await subscriptionPaymentsInRange(range.start, range.end);

  let gross = 0;
  let base = 0;
  let gst = 0;
  for (const p of payments) {
    const split = splitPaymentAmount(p, gstRate);
    gross += split.gross;
    base += split.base;
    gst += split.gst;
  }
  gross = round2(gross);
  base = round2(base);
  gst = round2(gst);

  const razorpayEstimate = round2(base * (razorpayRate / 100));
  const deals = await dealMetricsInRange(range.start, range.end);
  const expenseByCategory = await expensesByCategoryInRange(range.start, range.end);
  const loggedExpensesTotal = round2(expenseByCategory.reduce((s, e) => s + e.actual, 0));

  const partnerCommissionsOut = round2(
    (Number(deals.sales_commission) || 0) +
      (Number(deals.territory_commission) || 0) +
      (Number(deals.project_commission) || 0),
  );
  const tdsOut = round2(Number(deals.tds) || 0);

  const reparvCommissionIn = round2(Number(deals.reparv_commission) || 0);
  const dealGmv = round2(Number(deals.deal_gmv) || 0);

  const totalInflows = round2(gross + reparvCommissionIn);

  const expectedAllocations = computeExpectedAllocations(
    gross,
    base,
    config.categories,
    razorpayRate,
  );

  const categoryBreakdown = expectedAllocations.map((exp) => {
    const logged = expenseByCategory.find((e) => e.categoryId === exp.categoryId);
    const hasLogged = Number(logged?.actual || 0) > 0;
    const actual = exp.isComputed
      ? razorpayEstimate
      : hasLogged
        ? logged.actual
        : exp.expected ?? 0;
    return {
      ...exp,
      actual,
      variance: round2(actual - (exp.expected ?? 0)),
      source: exp.isComputed
        ? "estimated"
        : hasLogged
          ? "expense_ledger"
          : "allocation_rule",
    };
  });

  const categoryManagedOutflows = round2(
    categoryBreakdown.reduce((sum, row) => sum + (Number(row.actual) || 0), 0),
  );
  const totalOutflows = round2(categoryManagedOutflows + partnerCommissionsOut + tdsOut);
  const netCashPosition = round2(totalInflows - totalOutflows);
  const monthly =
    range.year && !range.month
      ? await monthlySubscriptionTotals(range.year, config.categories, razorpayRate)
      : [];

  const tiers = await tierBreakdown(payments, gstRate);

  return {
    range: {
      start: range.start,
      end: range.end,
      year: range.year,
      month: range.month,
    },
    settings: { razorpayFeeRate: razorpayRate, gstRate },
    summary: {
      subscriptionCollectionsGross: gross,
      subscriptionCollectionsExGst: base,
      subscriptionGst: gst,
      razorpayFeeEstimate: razorpayEstimate,
      dealGmv,
      reparvCommissionFromDeals: reparvCommissionIn,
      dealCommissionsPaidOut: partnerCommissionsOut,
      tdsPaidOut: tdsOut,
      loggedExpenses: loggedExpensesTotal,
      configuredCategoryOutflows: categoryManagedOutflows,
      totalInflows,
      totalOutflows,
      netCashPosition,
      dealCount: Number(deals.deal_count) || 0,
      subscriptionPaymentCount: payments.length,
    },
    categoryBreakdown,
    monthly,
    planTiers: tiers,
  };
}
