import dbPromise from "#db/promise";
import {
  createRazorpayPlanForSubscriptionPlanTable,
  isRazorpayConfigured,
} from "#utils/subscriptionRazorpayPlan.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);
const VALID_BILLING_CYCLES = new Set(["monthly", "yearly"]);

const toInt = (v) => Number.parseInt(v, 10);
const PARTNER_ROLE_MAP = {
  "Sales Partner": "sales",
  "Territory Partner": "territory",
  "Project Partner": "project",
};
const normalizeFeatureIds = (input) => {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isInteger(v) && v > 0))];
};

export const getAllPlans = async (_req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT
        sp.*,
        COALESCE(GROUP_CONCAT(DISTINCT sf.id ORDER BY sf.id), '') AS feature_ids_csv,
        COALESCE(GROUP_CONCAT(DISTINCT sf.name ORDER BY sf.id SEPARATOR '||'), '') AS feature_names_csv
      FROM subscription_plans sp
      LEFT JOIN plan_feature_mapping pfm ON pfm.plan_id = sp.id
      LEFT JOIN subscription_feature sf ON sf.id = pfm.feature_id
      GROUP BY sp.id
      ORDER BY sp.id DESC`,
    );
    const shaped = rows.map((r) => ({
      ...r,
      feature_ids: r.feature_ids_csv
        ? r.feature_ids_csv.split(",").map((v) => Number.parseInt(v, 10)).filter(Boolean)
        : [],
      feature_names: r.feature_names_csv ? r.feature_names_csv.split("||") : [],
    }));
    return res.status(200).json(shaped);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch subscription plans", error });
  }
};

export const getPlanById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const [rows] = await dbPromise.query(
      `SELECT
        sp.*,
        COALESCE(GROUP_CONCAT(DISTINCT sf.id ORDER BY sf.id), '') AS feature_ids_csv,
        COALESCE(GROUP_CONCAT(DISTINCT sf.name ORDER BY sf.id SEPARATOR '||'), '') AS feature_names_csv
      FROM subscription_plans sp
      LEFT JOIN plan_feature_mapping pfm ON pfm.plan_id = sp.id
      LEFT JOIN subscription_feature sf ON sf.id = pfm.feature_id
      WHERE sp.id = ?
      GROUP BY sp.id`,
      [id],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }

    const row = rows[0];
    return res.status(200).json({
      ...row,
      feature_ids: row.feature_ids_csv
        ? row.feature_ids_csv.split(",").map((v) => Number.parseInt(v, 10)).filter(Boolean)
        : [],
      feature_names: row.feature_names_csv ? row.feature_names_csv.split("||") : [],
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch plan", error });
  }
};

export const getPlansByPartnerType = async (req, res) => {
  try {
    const partnerType = String(req.params.partnerType || "").trim();
    const role = PARTNER_ROLE_MAP[partnerType] || partnerType.toLowerCase();
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid partner type" });
    }

    const [rows] = await dbPromise.query(
      `SELECT id, role, plan_name AS planName, duration, price AS totalPrice, billing_cycle, status
       FROM subscription_plans
       WHERE role = ? AND status = 'Active'
       ORDER BY price ASC`,
      [role],
    );

    const shaped = rows.map((r) => ({
      ...r,
      planDuration:
        r.billing_cycle === "yearly"
          ? `${r.duration} Year${r.duration > 1 ? "s" : ""}`
          : `${r.duration} Month${r.duration > 1 ? "s" : ""}`,
    }));
    return res.status(200).json(shaped);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch plans", error });
  }
};

export const createPlan = async (req, res) => {
  try {
    const {
      role,
      plan_name,
      duration,
      price,
      billing_cycle = "monthly",
      status = "Active",
      feature_ids = [],
    } = req.body;

    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (!VALID_BILLING_CYCLES.has(billing_cycle)) {
      return res.status(400).json({ message: "Invalid billing_cycle" });
    }
    if (!plan_name || !duration || !price) {
      return res
        .status(400)
        .json({ message: "role, plan_name, duration and price are required" });
    }

    const d = toInt(duration);
    const p = toInt(price);
    if (!d || d < 1) {
      return res.status(400).json({ message: "duration must be >= 1" });
    }
    if (!p || p < 1) {
      return res.status(400).json({ message: "price must be >= 1" });
    }

    const [duplicates] = await dbPromise.query(
      "SELECT id FROM subscription_plans WHERE role = ? AND plan_name = ? AND billing_cycle = ?",
      [role, plan_name, billing_cycle],
    );
    if (duplicates.length) {
      return res
        .status(409)
        .json({ message: "Plan already exists for this role and billing cycle" });
    }

    let razorpay_plan_id = null;
    let syncMeta = { synced: false };

    if (isRazorpayConfigured()) {
      const rz = await createRazorpayPlanForSubscriptionPlanTable({
        role,
        planName: plan_name,
        price: p,
        billingCycle: billing_cycle,
        duration: d,
      });
      if (!rz.skipped && rz.planId) {
        razorpay_plan_id = rz.planId;
        syncMeta = { synced: true, razorpay_plan_id };
      } else {
        syncMeta = { synced: false, reason: rz.reason };
      }
    } else {
      syncMeta = {
        synced: false,
        reason: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to sync plans",
      };
    }

    const [result] = await dbPromise.query(
      `INSERT INTO subscription_plans
        (role, plan_name, duration, price, billing_cycle, razorpay_plan_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [role, plan_name, d, p, billing_cycle, razorpay_plan_id, status],
    );
    const cleanFeatureIds = normalizeFeatureIds(feature_ids);
    if (cleanFeatureIds.length) {
      const values = cleanFeatureIds.map((featureId) => [result.insertId, featureId]);
      await dbPromise.query(
        "INSERT INTO plan_feature_mapping (plan_id, feature_id) VALUES ?",
        [values],
      );
    }

    return res.status(201).json({
      message: "Subscription plan created successfully",
      id: result.insertId,
      ...syncMeta,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: error?.message || "Failed to create plan",
      error,
    });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const { plan_name, duration, price, status, billing_cycle, feature_ids } = req.body;

    if (!id) return res.status(400).json({ message: "Invalid id" });
    if (!plan_name || !duration || !price) {
      return res
        .status(400)
        .json({ message: "plan_name, duration and price are required" });
    }

    const [rows] = await dbPromise.query(
      "SELECT * FROM subscription_plans WHERE id = ?",
      [id],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }
    const oldPlan = rows[0];

    const [duplicates] = await dbPromise.query(
      "SELECT id FROM subscription_plans WHERE role = ? AND plan_name = ? AND billing_cycle = ? AND id != ?",
      [oldPlan.role, plan_name, billing_cycle || oldPlan.billing_cycle || "monthly", id],
    );
    if (duplicates.length) {
      return res
        .status(409)
        .json({ message: "Plan already exists for this role and billing cycle" });
    }

    const nextDuration = toInt(duration);
    const nextPrice = toInt(price);
    const nextCycle = billing_cycle || oldPlan.billing_cycle || "monthly";

    if (!VALID_BILLING_CYCLES.has(nextCycle)) {
      return res.status(400).json({ message: "Invalid billing_cycle" });
    }
    if (!nextDuration || nextDuration < 1) {
      return res.status(400).json({ message: "duration must be >= 1" });
    }
    if (!nextPrice || nextPrice < 1) {
      return res.status(400).json({ message: "price must be >= 1" });
    }

    const billingChanged =
      Number(oldPlan.price) !== nextPrice ||
      Number(oldPlan.duration) !== nextDuration ||
      String(oldPlan.billing_cycle) !== String(nextCycle);

    let razorpay_plan_id = oldPlan.razorpay_plan_id || null;
    let syncMeta = { synced: Boolean(razorpay_plan_id), razorpay_plan_id };

    if (isRazorpayConfigured() && (billingChanged || !razorpay_plan_id)) {
      const rz = await createRazorpayPlanForSubscriptionPlanTable({
        role: oldPlan.role,
        planName: plan_name,
        price: nextPrice,
        billingCycle: nextCycle,
        duration: nextDuration,
        localPlanId: id,
      });
      if (!rz.skipped && rz.planId) {
        razorpay_plan_id = rz.planId;
        syncMeta = { synced: true, razorpay_plan_id };
      } else {
        syncMeta = { synced: false, reason: rz.reason, razorpay_plan_id };
      }
    }

    await dbPromise.query(
      `UPDATE subscription_plans
       SET plan_name = ?, duration = ?, price = ?, billing_cycle = ?, status = ?, razorpay_plan_id = ?
       WHERE id = ?`,
      [plan_name, nextDuration, nextPrice, nextCycle, status || "Active", razorpay_plan_id, id],
    );
    if (Array.isArray(feature_ids)) {
      const cleanFeatureIds = normalizeFeatureIds(feature_ids);
      await dbPromise.query("DELETE FROM plan_feature_mapping WHERE plan_id = ?", [id]);
      if (cleanFeatureIds.length) {
        const values = cleanFeatureIds.map((featureId) => [id, featureId]);
        await dbPromise.query(
          "INSERT INTO plan_feature_mapping (plan_id, feature_id) VALUES ?",
          [values],
        );
      }
    }

    return res.status(200).json({
      message: "Subscription plan updated successfully",
      ...syncMeta,
      razorpayRecreated: Boolean(billingChanged && razorpay_plan_id),
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: error?.message || "Failed to update plan",
      error,
    });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const [rows] = await dbPromise.query(
      "SELECT id, razorpay_plan_id FROM subscription_plans WHERE id = ?",
      [id],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }

    await dbPromise.query("DELETE FROM plan_feature_mapping WHERE plan_id = ?", [id]);
    await dbPromise.query("DELETE FROM subscription_plans WHERE id = ?", [id]);
    return res.status(200).json({
      message: "Subscription plan deleted successfully",
      razorpay_plan_id: rows[0].razorpay_plan_id || null,
      note: "Razorpay plans are immutable and cannot be deleted via API.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete plan", error });
  }
};
