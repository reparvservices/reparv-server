import dbPromise from "#db/promise";
import { resolvePlanPricingFromBody } from "../utils/gstCalculation.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);

const toInt = (v) => Number.parseInt(v, 10);
const normalizeFeatureIds = (input) => {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isInteger(v) && v > 0),
    ),
  ];
};

/** Group key for UI: same role + plan_name */
export const enterpriseGroupKey = (row) =>
  `${row.role}::${String(row.plan_name || "").trim()}`;

async function loadEnterpriseSiblings(role, planName) {
  const [rows] = await dbPromise.query(
    `SELECT * FROM subscription_plans
     WHERE role = ? AND plan_name = ? AND LOWER(plan_type) = 'enterprise'
     ORDER BY id ASC`,
    [role, planName],
  );
  return rows;
}

async function syncFeaturesForPlanIds(planIds, featureIds) {
  for (const planId of planIds) {
    await dbPromise.query("DELETE FROM plan_feature_mapping WHERE plan_id = ?", [planId]);
    if (featureIds.length) {
      const values = featureIds.map((fid) => [planId, fid]);
      await dbPromise.query(
        "INSERT INTO plan_feature_mapping (plan_id, feature_id) VALUES ?",
        [values],
      );
    }
  }
}

async function assertNoDuplicateEnterprise(role, planName, excludeId = null) {
  const params = [role, planName];
  let sql = `SELECT id FROM subscription_plans
    WHERE role = ? AND plan_name = ? AND LOWER(plan_type) = 'enterprise'`;
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const [dup] = await dbPromise.query(sql, params);
  if (dup.length) {
    const e = new Error(
      "An enterprise plan with this name already exists for the selected partner type.",
    );
    e.statusCode = 409;
    throw e;
  }
}

const zeroPricing = () => ({ base: 0, gst: 0, total: 0 });

const resolveEnterprisePricing = (basePriceInput, priceInput) => {
  const pricing = resolvePlanPricingFromBody({
    base_price: basePriceInput,
    price: priceInput,
  });
  if (pricing) return pricing;
  return zeroPricing();
};

/** Remove legacy duplicate monthly/yearly rows; keep the first row. */
async function dedupeEnterpriseRows(role, planName) {
  const siblings = await loadEnterpriseSiblings(role, planName);
  if (siblings.length <= 1) return siblings[0] || null;

  const [keep, ...extra] = siblings;
  const extraIds = extra.map((r) => r.id);
  if (extraIds.length) {
    await dbPromise.query("DELETE FROM plan_feature_mapping WHERE plan_id IN (?)", [extraIds]);
    await dbPromise.query("DELETE FROM subscription_plans WHERE id IN (?)", [extraIds]);
  }
  return keep;
}

/**
 * Create one enterprise plan row. Billing cycle (monthly/yearly) is chosen at assign time.
 */
export async function createEnterprisePlanGroup(body) {
  const {
    role,
    plan_name,
    status = "Active",
    feature_ids = [],
    duration,
    duration_monthly,
    base_price,
    price,
  } = body;

  if (!VALID_ROLES.has(role)) {
    const e = new Error("Invalid role");
    e.statusCode = 400;
    throw e;
  }
  const planName = String(plan_name || "").trim();
  if (!planName) {
    const e = new Error("plan_name is required");
    e.statusCode = 400;
    throw e;
  }

  const d = toInt(duration ?? duration_monthly ?? 1);
  if (!d || d < 1) {
    const e = new Error("duration must be >= 1");
    e.statusCode = 400;
    throw e;
  }

  await assertNoDuplicateEnterprise(role, planName);

  const pricing = resolveEnterprisePricing(base_price, price);
  const [result] = await dbPromise.query(
    `INSERT INTO subscription_plans
      (role, plan_name, duration, price, base_price, gst_amount, billing_cycle,
       razorpay_plan_id, status, plan_type)
     VALUES (?, ?, ?, ?, ?, ?, 'monthly', NULL, ?, 'enterprise')`,
    [role, planName, d, pricing.total, pricing.base, pricing.gst, status],
  );

  const planId = result.insertId;
  const cleanFeatureIds = normalizeFeatureIds(feature_ids);
  await syncFeaturesForPlanIds([planId], cleanFeatureIds);

  return {
    message: "Enterprise plan created successfully",
    ids: [planId],
    plan_name: planName,
    role,
    synced: false,
    reason: "Enterprise plans are admin-assigned only (no Razorpay)",
  };
}

/**
 * Update a single enterprise plan; removes duplicate rows from older creates.
 */
export async function updateEnterprisePlanGroup(existingRow, body) {
  const role = existingRow.role;
  const oldName = String(existingRow.plan_name || "").trim();

  const {
    plan_name,
    status = "Active",
    feature_ids,
    duration,
    duration_monthly,
    base_price,
    price,
  } = body;

  const planName = String(plan_name || oldName).trim();
  if (!planName) {
    const e = new Error("plan_name is required");
    e.statusCode = 400;
    throw e;
  }

  const d = toInt(duration ?? duration_monthly ?? existingRow.duration ?? 1);
  if (!d || d < 1) {
    const e = new Error("duration must be >= 1");
    e.statusCode = 400;
    throw e;
  }

  const primary = await dedupeEnterpriseRows(role, oldName);
  if (!primary) {
    const e = new Error("Enterprise plan not found");
    e.statusCode = 404;
    throw e;
  }

  if (planName !== oldName || role !== primary.role) {
    await assertNoDuplicateEnterprise(role, planName, primary.id);
  }

  const pricing = resolveEnterprisePricing(base_price, price);
  await dbPromise.query(
    `UPDATE subscription_plans
     SET plan_name = ?, duration = ?, price = ?, base_price = ?, gst_amount = ?,
         status = ?, plan_type = 'enterprise'
     WHERE id = ?`,
    [planName, d, pricing.total, pricing.base, pricing.gst, status, primary.id],
  );

  if (planName !== oldName) {
    await dedupeEnterpriseRows(role, planName);
  }

  const cleanFeatureIds = feature_ids != null ? normalizeFeatureIds(feature_ids) : null;
  if (cleanFeatureIds) {
    await syncFeaturesForPlanIds([primary.id], cleanFeatureIds);
  }

  return {
    message: "Enterprise plan updated successfully",
    plan_name: planName,
    role,
    ids: [primary.id],
  };
}

/** Delete enterprise plan (and any legacy duplicate rows). */
export async function deleteEnterprisePlanGroup(planRow) {
  const role = planRow.role;
  const planName = String(planRow.plan_name || "").trim();
  const siblings = await loadEnterpriseSiblings(role, planName);
  const ids = siblings.map((r) => r.id);

  if (ids.length) {
    await dbPromise.query("DELETE FROM plan_feature_mapping WHERE plan_id IN (?)", [ids]);
    await dbPromise.query("DELETE FROM subscription_plans WHERE id IN (?)", [ids]);
  }

  return { deleted: ids.length, plan_name: planName, role };
}
