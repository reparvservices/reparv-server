import dbPromise from "#db/promise";
import { isPartnerSubscriptionAccessActive } from "../../portals/subscription/utils/subscriptionAccess.js";
import {
  requiredFeatureForApi,
  getPlanFeatureNames,
  isAllFeaturePlan,
  planHasFeature,
} from "../../portals/subscription/utils/partnerFeatures.js";

const EXEMPT_PREFIXES = [
  "/project-partner/login",
  "/project-partner/subscription",
  "/project-partner/profile",
  "/sales/login",
  "/sales/subscription",
  "/territory-partner/login",
  "/territory-partner/subscription",
  // Mobile apps: sign-in, OTP, password, profile and buying a plan stay open
  "/projectpartner/auth",
  "/projectpartner/subscription",
  "/projectpartner/profile",
  "/salesapp/api",
  "/salesapp/subscription",
  "/territoryapp/auth",
  "/territoryapp/subscription",
];

const GATED_PREFIXES = [
  // Web partner panels
  "/project-partner/",
  "/sales/",
  "/territory-partner/",
  // Mobile partner apps
  "/projectpartner/",
  "/salesapp/",
  "/territoryapp/",
];

/** Safe read methods — allow browse without subscription (feature-lock UX). */
const BROWSE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function resolvePartner(req) {
  if (req.projectPartnerUser?.id) {
    return { userId: req.projectPartnerUser.id, role: "project" };
  }
  if (req.salesUser?.id) {
    return { userId: req.salesUser.id, role: "sales" };
  }
  if (req.territoryUser?.id) {
    return { userId: req.territoryUser.id, role: "territory" };
  }
  return null;
}

/**
 * Rows that currently grant access. Any such row counts; a newer pending
 * checkout row must not lock out a partner who already has an active plan.
 */
async function activeSubscriptionRows(userId, role) {
  const [rows] = await dbPromise.query(
    `SELECT us.status, us.end_date, us.plan_id, sp.plan_type
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = ? AND us.role = ?`,
    [userId, role],
  );
  return rows.filter((row) => isPartnerSubscriptionAccessActive(row));
}

/** Does one of the partner's active plans include this feature? */
async function activePlansIncludeFeature(activeRows, feature) {
  if (activeRows.some((row) => isAllFeaturePlan(row.plan_type))) return true;
  const features = await getPlanFeatureNames(activeRows.map((row) => row.plan_id));
  return planHasFeature(features, feature);
}

/**
 * After verifyToken: block partner panel APIs without active subscription.
 */
export async function requireActivePartnerSubscription(req, res, next) {
  try {
    const path = req.path || "";

    if (!GATED_PREFIXES.some((p) => path.startsWith(p))) {
      return next();
    }
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
      return next();
    }

    const partner = resolvePartner(req);
    if (!partner) {
      return next();
    }

    const method = (req.method || "GET").toUpperCase();
    if (BROWSE_METHODS.has(method)) {
      return next();
    }

    const activeRows = await activeSubscriptionRows(partner.userId, partner.role);
    if (!activeRows.length) {
      return res.status(402).json({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
        message: "Active subscription required. Please subscribe to continue.",
      });
    }

    // Plan features (managed in admin Subscription Pricing) unlock panel areas
    const feature = requiredFeatureForApi(path, partner.role);
    if (feature && !(await activePlansIncludeFeature(activeRows, feature))) {
      return res.status(403).json({
        success: false,
        code: "FEATURE_LOCKED",
        feature,
        message: `Your plan doesn't include "${feature}". Upgrade your plan to use this.`,
      });
    }

    return next();
  } catch (err) {
    console.error("requireActivePartnerSubscription:", err);
    return res.status(500).json({ message: "Subscription check failed" });
  }
}
