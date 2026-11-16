import jwt from "jsonwebtoken";
import dbPromise from "#db/promise";

/**
 * Customer tokens are { id, email } (Google/Facebook login) or { id, contact } (phone OTP login).
 * The token must name the same user row by at least one of those, and every identifier it carries
 * must match. Partner tokens share the signing secret but never match a guestUsers row this way.
 */
export function tokenMatchesCustomer(decoded, row) {
  if (!decoded || !row || Number(decoded.id) !== Number(row.id)) return false;
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const hasEmail = decoded.email !== undefined;
  const hasContact = decoded.contact !== undefined;
  if (!hasEmail && !hasContact) return false;
  if (hasEmail && norm(decoded.email) !== norm(row.email)) return false;
  if (hasContact && norm(decoded.contact) !== norm(row.contact)) return false;
  return true;
}

/**
 * Customer-app login (Bearer JWT of the shape { id, email } signed for a guestUsers row).
 * Partner tokens share the signing secret, so the token must also match a real guestUsers row
 * (same id AND email); that is what stops a partner token passing as a customer.
 */
export async function requireCustomer(req, res, next) {
  const header = req.headers?.authorization;
  const token = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() : null;
  if (!token) return res.status(401).json({ success: false, message: "Please log in to continue." });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }

  try {
    const [rows] = await dbPromise.query(
      "SELECT id, fullname, email, contact FROM guestUsers WHERE id = ? LIMIT 1",
      [decoded?.id],
    );
    if (!rows.length || !tokenMatchesCustomer(decoded, rows[0])) return res.status(401).json({ success: false, message: "Please log in to continue." });
    req.customer = rows[0];
    return next();
  } catch (err) {
    console.error("[requireCustomer]", err.message);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
}
