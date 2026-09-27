import dbPromise from "#db/promise";

/**
 * Access rules for /admin/* APIs.
 *
 * - A few endpoints are public (sign-in, lookups, website forms, partner sign-up).
 * - Everything else needs an admin login.
 * - Project partners may use a small set of admin endpoints the partner panel
 *   relies on, but only for their own sales/territory partners and properties.
 */

const ANY = "*";

/** No login required. [method, path regex] */
const PUBLIC_ADMIN_RULES = [
  ["POST", /^\/admin\/login\/?$/],
  ["POST", /^\/admin\/login\/forgot-password\/?$/],
  ["POST", /^\/admin\/logout\/?$/],
  ["GET", /^\/admin\/auth\/me\/?$/],
  ["GET", /^\/admin\/session-data\/?$/],
  ["POST", /^\/admin\/setup\/create-user\/?$/], // guarded by ADMIN_SETUP_SECRET

  // Read-only lookups and content used by the website and partner sign-up pages
  ["GET", /^\/admin\/(states|cities|authorities)(\/.*)?$/],
  ["GET", /^\/admin\/faqs(\/.*)?$/],
  ["GET", /^\/admin\/marketing-content(\/.*)?$/],
  ["GET", /^\/admin\/blog(\/.*)?$/],
  ["GET", /^\/admin\/projectpartner\/get\/in\/[^/]+\/?$/],

  // Partner self sign-up
  ["POST", /^\/admin\/(salespersons|territorypartner|projectpartner|partner|promoter)\/add\/?$/],

  // Website forms and visit tracking
  ["POST", /^\/admin\/(subscribers|call-enquirers|whatsapp-enquirers)\/add\/?$/],
  ["POST", /^\/admin\/(propertyAnalytics|blogAnalytics|newsAnalytics)\/addvisits(\/.*)?$/],
];

/** Owner lookups: does record :id belong to project partner ? */
const OWNER_SQL = {
  sales: "SELECT 1 FROM salespersons WHERE salespersonsid = ? AND projectpartnerid = ? LIMIT 1",
  territory: "SELECT 1 FROM territorypartner WHERE id = ? AND projectpartnerid = ? LIMIT 1",
  property: "SELECT 1 FROM properties WHERE propertyid = ? AND projectpartnerid = ? LIMIT 1",
};

/** Admin endpoints the project partner panel uses. [method, regex, owner kind | null] */
const PROJECT_PARTNER_ADMIN_RULES = [
  ["GET", /^\/admin\/salespersons\/get\/(\d+)\/?$/, "sales"],
  ["PUT", /^\/admin\/salespersons\/status\/(\d+)\/?$/, "sales"],
  ["GET", /^\/admin\/salespersons\/followup\/list\/(\d+)\/?$/, "sales"],
  ["POST", /^\/admin\/salespersons\/followup\/add\/(\d+)\/?$/, "sales"],
  ["PUT", /^\/admin\/salespersons\/assignlogin\/(\d+)\/?$/, "sales"],
  ["DELETE", /^\/admin\/salespersons\/delete\/(\d+)\/?$/, "sales"],

  ["GET", /^\/admin\/territorypartner\/get\/(\d+)\/?$/, "territory"],
  ["PUT", /^\/admin\/territorypartner\/status\/(\d+)\/?$/, "territory"],
  ["GET", /^\/admin\/territorypartner\/followup\/list\/(\d+)\/?$/, "territory"],
  ["POST", /^\/admin\/territorypartner\/followup\/add\/(\d+)\/?$/, "territory"],
  ["PUT", /^\/admin\/territorypartner\/assignlogin\/(\d+)\/?$/, "territory"],
  ["DELETE", /^\/admin\/territorypartner\/delete\/(\d+)\/?$/, "territory"],

  ["POST", /^\/admin\/properties\/check-property-name\/?$/, null],
  ["DELETE", /^\/admin\/properties\/images\/delete\/(\d+)\/?$/, "property"],
  ["PUT", /^\/admin\/properties\/set\/hotdeal\/(\d+)\/?$/, "property"],
];

const matches = (rules, method, path) =>
  rules.find(([m, re]) => (m === ANY || m === method) && re.test(path));

const isAdminPath = (path) => path === "/admin" || path.startsWith("/admin/");

/** Used by verifyToken: public /admin endpoints skip authentication. */
export function isPublicAdminRequest(method, path) {
  return Boolean(matches(PUBLIC_ADMIN_RULES, String(method).toUpperCase(), path));
}

export { isAdminPath };

/** Runs after verifyToken. */
export async function requireAdminAccess(req, res, next) {
  const path = req.path || "";
  if (!isAdminPath(path)) return next();

  const method = String(req.method || "GET").toUpperCase();
  if (method === "OPTIONS") return next();
  if (isPublicAdminRequest(method, path)) return next();
  if (req.adminUser) return next();

  const partnerId = req.projectPartnerUser?.id;
  const rule = partnerId ? matches(PROJECT_PARTNER_ADMIN_RULES, method, path) : null;
  if (!rule) {
    return res.status(403).json({ message: "Admin access required" });
  }

  const [, re, ownerKind] = rule;
  if (!ownerKind) return next();

  try {
    const recordId = Number(path.match(re)[1]);
    const [rows] = await dbPromise.query(OWNER_SQL[ownerKind], [recordId, partnerId]);
    if (!rows.length) {
      return res.status(403).json({ message: "You can only manage your own records" });
    }
    return next();
  } catch (err) {
    console.error("requireAdminAccess:", err);
    return res.status(500).json({ message: "Access check failed" });
  }
}
