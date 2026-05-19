import dbPromise from "#db/promise";
import {
  createRazorpayPlanForSubscriptionPlanTable,
  isRazorpayConfigured,
} from "#utils/subscriptionRazorpayPlan.js";
import { resolvePlanPricingFromBody } from "../../utils/gstCalculation.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);
const VALID_BILLING_CYCLES = new Set(["monthly", "yearly"]);
const VALID_PLAN_TYPES = new Set(["paid", "trial"]);

const normalizePlanType = (value) => {
  const t = String(value || "paid").toLowerCase();
  return VALID_PLAN_TYPES.has(t) ? t : "paid";
};

const planDurationLabel = (duration, billingCycle, planType) => {
  const d = Number(duration) || 1;
  if (planType === "trial") {
    return `${d} Day${d > 1 ? "s" : ""}`;
  }
  if (billingCycle === "yearly") {
    return `${d} Year${d > 1 ? "s" : ""}`;
  }
  return `${d} Month${d > 1 ? "s" : ""}`;
};

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
      `SELECT
        sp.id,
        sp.role,
        sp.plan_name AS planName,
        sp.duration,
        sp.base_price AS basePrice,
        sp.gst_amount AS gstAmount,
        sp.price AS totalPrice,
        sp.billing_cycle,
        sp.status,
        sp.plan_type,
        COALESCE(GROUP_CONCAT(DISTINCT sf.name ORDER BY sf.id SEPARATOR '||'), '') AS features
      FROM subscription_plans sp
      LEFT JOIN plan_feature_mapping pfm ON pfm.plan_id = sp.id
      LEFT JOIN subscription_feature sf ON sf.id = pfm.feature_id
      WHERE sp.role = ? AND sp.status = 'Active'
      GROUP BY sp.id
      ORDER BY CASE WHEN sp.plan_type = 'trial' THEN 0 ELSE 1 END, sp.price ASC`,
      [role],
    );

    const shaped = rows.map((r) => {
      const featureNames = r.features
        ? String(r.features)
            .split("||")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      return {
        ...r,
        basePrice: r.basePrice ?? Math.round(Number(r.totalPrice || 0) / 1.18),
        gstAmount:
          r.gstAmount ??
          Number(r.totalPrice || 0) - Math.round(Number(r.totalPrice || 0) / 1.18),
        features: featureNames.join(", "),
        feature_names: featureNames,
        plan_type: r.plan_type || "paid",
        planType: r.plan_type || "paid",
        isTrial: String(r.plan_type || "").toLowerCase() === "trial",
        planDuration: planDurationLabel(
          r.duration,
          r.billing_cycle,
          r.plan_type || "paid",
        ),
      };
    });
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
      base_price,
      billing_cycle = "monthly",
      status = "Active",
      feature_ids = [],
      plan_type: planTypeRaw,
    } = req.body;

    const plan_type = normalizePlanType(planTypeRaw);
    const isTrial = plan_type === "trial";

    // #region agent log
    fetch("http://127.0.0.1:7873/ingest/e030798b-abf2-42c8-b0a1-b6795e79c4b6", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ab9682" },
      body: JSON.stringify({
        sessionId: "ab9682",
        hypothesisId: "D",
        location: "subscriptionPlan.controller.js:createPlan",
        message: "createPlan",
        data: { role, plan_type, isTrial, duration: toInt(duration) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (!VALID_BILLING_CYCLES.has(billing_cycle) && !isTrial) {
      return res.status(400).json({ message: "Invalid billing_cycle" });
    }
    if (!plan_name || !duration) {
      return res.status(400).json({
        message: "role, plan_name, and duration are required",
      });
    }

    const d = toInt(duration);
    if (!d || d < 1) {
      return res.status(400).json({ message: "duration must be >= 1" });
    }

    let basePrice;
    let gstAmount;
    let totalPrice;
    if (isTrial) {
      basePrice = 0;
      gstAmount = 0;
      totalPrice = 0;
    } else {
      if (base_price == null && price == null) {
        return res.status(400).json({
          message: "base_price (or price) is required for paid plans",
        });
      }
      const pricing = resolvePlanPricingFromBody({ base_price, price });
      if (!pricing || !pricing.base || pricing.base < 1) {
        return res.status(400).json({ message: "base_price must be >= 1" });
      }
      basePrice = pricing.base;
      gstAmount = pricing.gst;
      totalPrice = pricing.total;
    }

    const cycleForDb = isTrial ? "monthly" : billing_cycle;

    const [duplicates] = await dbPromise.query(
      "SELECT id FROM subscription_plans WHERE role = ? AND plan_name = ? AND billing_cycle = ?",
      [role, plan_name, cycleForDb],
    );
    if (duplicates.length) {
      return res.status(409).json({
        message:
          "This plan name already exists for the selected partner type and billing period. Change the plan name or billing period, or edit the existing plan.",
      });
    }

    let razorpay_plan_id = null;
    let syncMeta = { synced: false };

    if (!isTrial && isRazorpayConfigured()) {
      const rz = await createRazorpayPlanForSubscriptionPlanTable({
        role,
        planName: plan_name,
        price: totalPrice,
        billingCycle: cycleForDb,
        duration: d,
      });
      if (!rz.skipped && rz.planId) {
        razorpay_plan_id = rz.planId;
        syncMeta = { synced: true, razorpay_plan_id };
      } else {
        syncMeta = { synced: false, reason: rz.reason };
      }
    } else if (isTrial) {
      syncMeta = { synced: false, reason: "Trial plans do not use Razorpay" };
    } else {
      syncMeta = {
        synced: false,
        reason: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to sync plans",
      };
    }

    const [result] = await dbPromise.query(
      `INSERT INTO subscription_plans
        (role, plan_name, duration, price, base_price, gst_amount, billing_cycle, razorpay_plan_id, status, plan_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        role,
        plan_name,
        d,
        totalPrice,
        basePrice,
        gstAmount,
        cycleForDb,
        razorpay_plan_id,
        status,
        plan_type,
      ],
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
    const {
      plan_name,
      duration,
      price,
      base_price,
      status,
      billing_cycle,
      feature_ids,
      plan_type: planTypeRaw,
    } = req.body;

    if (!id) return res.status(400).json({ message: "Invalid id" });
    if (!plan_name || !duration) {
      return res.status(400).json({
        message: "plan_name and duration are required",
      });
    }

    const [rows] = await dbPromise.query(
      "SELECT * FROM subscription_plans WHERE id = ?",
      [id],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }
    const oldPlan = rows[0];
    const plan_type = normalizePlanType(planTypeRaw ?? oldPlan.plan_type);
    const isTrial = plan_type === "trial";

    const nextCycle = isTrial
      ? oldPlan.billing_cycle || "monthly"
      : billing_cycle || oldPlan.billing_cycle || "monthly";

    const [duplicates] = await dbPromise.query(
      "SELECT id FROM subscription_plans WHERE role = ? AND plan_name = ? AND billing_cycle = ? AND id != ?",
      [oldPlan.role, plan_name, nextCycle, id],
    );
    if (duplicates.length) {
      return res.status(409).json({
        message:
          "This plan name already exists for the selected partner type and billing period. Change the plan name or billing period.",
      });
    }

    const nextDuration = toInt(duration);

    if (!VALID_BILLING_CYCLES.has(nextCycle) && !isTrial) {
      return res.status(400).json({ message: "Invalid billing_cycle" });
    }
    if (!nextDuration || nextDuration < 1) {
      return res.status(400).json({ message: "duration must be >= 1" });
    }

    let nextBase;
    let nextGst;
    let nextPrice;
    if (isTrial) {
      nextBase = 0;
      nextGst = 0;
      nextPrice = 0;
    } else {
      if (base_price == null && price == null) {
        return res.status(400).json({
          message: "base_price (or price) is required for paid plans",
        });
      }
      const pricing = resolvePlanPricingFromBody({ base_price, price });
      if (!pricing || !pricing.base || pricing.base < 1) {
        return res.status(400).json({ message: "base_price must be >= 1" });
      }
      nextBase = pricing.base;
      nextGst = pricing.gst;
      nextPrice = pricing.total;
    }

    const billingChanged =
      !isTrial &&
      (Number(oldPlan.price) !== nextPrice ||
        Number(oldPlan.base_price || 0) !== nextBase ||
        Number(oldPlan.duration) !== nextDuration ||
        String(oldPlan.billing_cycle) !== String(nextCycle));

    let razorpay_plan_id = isTrial ? null : oldPlan.razorpay_plan_id || null;
    let syncMeta = {
      synced: Boolean(razorpay_plan_id),
      razorpay_plan_id,
    };

    if (
      !isTrial &&
      isRazorpayConfigured() &&
      (billingChanged || !razorpay_plan_id)
    ) {
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
    } else if (isTrial) {
      syncMeta = { synced: false, reason: "Trial plans do not use Razorpay" };
    }

    await dbPromise.query(
      `UPDATE subscription_plans
       SET plan_name = ?, duration = ?, price = ?, base_price = ?, gst_amount = ?,
           billing_cycle = ?, status = ?, razorpay_plan_id = ?, plan_type = ?
       WHERE id = ?`,
      [
        plan_name,
        nextDuration,
        nextPrice,
        nextBase,
        nextGst,
        nextCycle,
        status || "Active",
        razorpay_plan_id,
        plan_type,
        id,
      ],
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
