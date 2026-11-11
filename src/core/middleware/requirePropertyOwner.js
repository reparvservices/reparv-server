import dbPromise from "#db/promise";
import { readProjectPartner } from "./verifyToken.js";

/** Allows the request only if the logged-in partner owns the property. */
export async function requirePropertyOwner(req, res, next) {
  try {
    const partner = req.projectPartnerUser || readProjectPartner(req);
    if (!partner?.id) {
      return res.status(401).json({ message: "Unauthorized. Please log in." });
    }
    req.projectPartnerUser = partner;

    const propertyId = Number(req.params.id ?? req.params.propertyid);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ message: "Invalid property ID" });
    }

    const [rows] = await dbPromise.query(
      "SELECT projectpartnerid FROM properties WHERE propertyid = ?",
      [propertyId],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Property not found" });
    }
    if (String(rows[0].projectpartnerid) !== String(partner.id)) {
      return res.status(403).json({ message: "You can only change your own properties." });
    }
    return next();
  } catch (err) {
    console.error("requirePropertyOwner:", err);
    return res.status(500).json({ message: "Property access check failed" });
  }
}
