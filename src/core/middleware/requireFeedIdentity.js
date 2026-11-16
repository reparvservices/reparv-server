import { resolveCheckoutIdentities } from "./requireCheckoutIdentity.js";

/**
 * /api/feed and /api/follow are mounted outside verifyToken and used to trust `user_id` /
 * `user_role` from the request, so anyone could post, like, follow or read notifications as any
 * partner. This requires a partner login and, where the request acts AS a partner, that the
 * named partner is the logged-in one.
 *
 *  - Writes (anything but GET): the acting partner must be the logged-in partner.
 *  - Private reads (notifications, saved posts): same.
 *  - Other reads: login only, because profile screens pass the *viewed* partner's id.
 *
 * FEED_REQUIRE_AUTH=false switches it off while old clients (no token) are still in the field.
 */

const ROLE_SHORT = {
  project_partner: "project",
  sales_partner: "sales",
  territory_partner: "territory",
};

// Same spellings the controllers accept for user_role.
const ROLE_ALIASES = {
  "project person": "project",
  "sales person": "sales",
  "territory person": "territory",
  "project partner": "project",
  "sales partner": "sales",
  "territory partner": "territory",
  project: "project",
  sales: "sales",
  territory: "territory",
  ...ROLE_SHORT,
};

export function shortRole(value) {
  return ROLE_ALIASES[String(value || "").trim().toLowerCase()] || null;
}

const PRIVATE_READ = /^\/(notifications|saved)(\/|$)/;

/** Pure decision, so it can be unit-tested. Returns { ok: true } or { ok: false, status, message }. */
export function decideFeedAccess({ method, path, identities, body, query }) {
  if (!identities.length) {
    return { ok: false, status: 401, message: "Unauthorized. Please log in." };
  }
  const mustMatch = String(method).toUpperCase() !== "GET" || PRIVATE_READ.test(path || "");
  if (!mustMatch) return { ok: true };

  const rawId = body?.user_id ?? query?.user_id;
  const role = shortRole(body?.user_role ?? query?.user_role);
  // Missing identity fields: let the controller answer 400 as before.
  if (rawId === undefined || rawId === null || rawId === "" || !role) return { ok: true };

  const id = String(rawId);
  if (identities.some((i) => i.role === role && i.id === id)) return { ok: true };
  return { ok: false, status: 403, message: "You can only act as yourself." };
}

export function requireFeedIdentity(req, res, next) {
  if (String(process.env.FEED_REQUIRE_AUTH).toLowerCase() === "false") return next();
  const decision = decideFeedAccess({
    method: req.method,
    path: req.path,
    identities: resolveCheckoutIdentities(req),
    body: req.body,
    query: req.query,
  });
  if (decision.ok) return next();
  return res.status(decision.status).json({ success: false, message: decision.message });
}
