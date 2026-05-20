import dbPromise from "#db/promise";
import { isPartnerSubscriptionAccessActive } from "../../portals/subscription/utils/subscriptionAccess.js";

const EXEMPT_PREFIXES = [
  "/project-partner/login",
  "/project-partner/subscription",
  "/project-partner/profile",
  "/projectpartner/subscription",
  "/sales/login",
  "/sales/subscription",
  "/territory-partner/login",
  "/territory-partner/subscription",
];

const GATED_PREFIXES = ["/project-partner/", "/sales/", "/territory-partner/"];

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

async function hasActiveSubscription(userId, role) {
  const [rows] = await dbPromise.query(
    `SELECT status, end_date
     FROM user_subscriptions
     WHERE user_id = ? AND role = ?
     ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
     LIMIT 1`,
    [userId, role],
  );
  if (!rows.length) return false;
  return isPartnerSubscriptionAccessActive(rows[0]);
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

    const active = await hasActiveSubscription(partner.userId, partner.role);
    if (!active) {
      return res.status(402).json({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
        message: "Active subscription required. Please subscribe to continue.",
      });
    }

    return next();
  } catch (err) {
    console.error("requireActivePartnerSubscription:", err);
    return res.status(500).json({ message: "Subscription check failed" });
  }
}
