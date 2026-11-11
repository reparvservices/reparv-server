import dbPromise from "#db/promise";
import { readProjectPartner } from "./verifyToken.js";

const REGISTRATION_WINDOW_HOURS = 2;

/**
 * Starting a trial needs that partner's own login, except right after
 * registration, when the signup screen has no session yet.
 */
export async function allowPartnerTrialActivation(req, res, next) {
  try {
    const partner = readProjectPartner(req);
    if (partner?.id) {
      if (String(partner.id) === String(req.params.userId)) return next();
      return res.status(403).json({ success: false, message: "You can only start your own trial." });
    }
    const [rows] = await dbPromise.query(
      `SELECT id FROM projectpartner
       WHERE id = ? AND created_at >= NOW() - INTERVAL ${REGISTRATION_WINDOW_HOURS} HOUR`,
      [req.params.userId],
    );
    if (rows.length) return next();
    return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
  } catch (err) {
    console.error("allowPartnerTrialActivation:", err);
    return res.status(500).json({ success: false, message: "Could not verify account" });
  }
}
