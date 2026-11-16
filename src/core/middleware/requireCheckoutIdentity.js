import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

/**
 * The payment checkout (`/api/subscription/payment/*`) is mounted outside verifyToken, and its
 * handlers trust `role` / `user_id` from the body. This middleware requires a valid login and
 * makes sure the body's partner is the logged-in partner, so nobody can open orders or pending
 * subscription rows on someone else's behalf.
 *
 * Set CHECKOUT_REQUIRE_AUTH=false to switch it off (e.g. while an old client without a token
 * is still rolling out).
 */

const COOKIE_ROLE = {
  projectPartnerToken: "project",
  salesToken: "sales",
  territoryToken: "territory",
};

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  const match = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match?.[1]?.trim() || null;
}

/**
 * Which partner roles a decoded token can belong to. Project partner tokens carry
 * `freeProjectPartner`; sales and territory tokens share the same fields, so a bearer token
 * from those is ambiguous and matches either (the user id still has to match).
 */
export function rolesForDecodedToken(decoded) {
  if (!decoded || decoded.id === undefined || decoded.id === null) return [];
  if (decoded.freeProjectPartner !== undefined) return ["project"];
  return ["sales", "territory"];
}

/** All (role, id) identities proven by the request's cookies / bearer token. */
export function resolveCheckoutIdentities(req, verify = (t) => jwt.verify(t, process.env.JWT_SECRET)) {
  const identities = [];
  for (const [cookie, role] of Object.entries(COOKIE_ROLE)) {
    const token = req.cookies?.[cookie];
    if (!token) continue;
    try {
      const decoded = verify(token);
      if (decoded?.id !== undefined && decoded?.id !== null) identities.push({ role, id: String(decoded.id) });
    } catch {
      /* invalid cookie: ignore */
    }
  }
  const bearer = readBearerToken(req);
  if (bearer) {
    try {
      const decoded = verify(bearer);
      for (const role of rolesForDecodedToken(decoded)) identities.push({ role, id: String(decoded.id) });
    } catch {
      /* invalid bearer: ignore */
    }
  }
  return identities;
}

/** True when one of the proven identities is the partner named in the request body. */
export function bodyMatchesIdentity(body, identities) {
  const role = String(body?.role || "").toLowerCase();
  const userId = String(body?.user_id ?? "");
  return identities.some((i) => i.role === role && i.id === userId);
}

export function requireCheckoutIdentity(req, res, next) {
  if (String(process.env.CHECKOUT_REQUIRE_AUTH).toLowerCase() === "false") return next();

  const identities = resolveCheckoutIdentities(req);
  if (!identities.length) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
  }
  if (!bodyMatchesIdentity(req.body, identities)) {
    return res
      .status(403)
      .json({ success: false, message: "You can only pay for your own account." });
  }
  next();
}

/** Throttles checkout calls per IP (each one can create a Razorpay order). */
export const checkoutRateLimit = rateLimit({
  windowMs: Number(process.env.CHECKOUT_RATE_LIMIT_WINDOW_MS) || 15 * 60_000,
  max: Number(process.env.CHECKOUT_RATE_LIMIT_MAX) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many payment attempts. Please try again later." },
});
