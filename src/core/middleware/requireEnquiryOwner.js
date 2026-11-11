import dbPromise from "#db/promise";
import { readProjectPartner } from "./verifyToken.js";

/**
 * Enquiries a project partner may see or change. Same rule as the partner's
 * enquiry list (projectPartner enquirerController.getAll): the enquiry is on
 * their property, assigned to them, brokered by them, or listed by them.
 */
export const PARTNER_ENQUIRY_SQL = `
  SELECT 1 FROM enquirers e
  LEFT JOIN properties p ON p.propertyid = e.propertyid
  WHERE e.enquirersid = ?
    AND (p.projectpartnerid = ? OR e.projectpartnerid = ?
         OR e.projectbroker = ? OR e.projectpartner = ?)
  LIMIT 1`;

export async function partnerOwnsEnquiry(enquiryId, partnerId) {
  const [rows] = await dbPromise.query(PARTNER_ENQUIRY_SQL, [
    enquiryId, partnerId, partnerId, partnerId, partnerId,
  ]);
  return rows.length > 0;
}

const loggedInPartner = (req) => {
  const partner = req.projectPartnerUser || readProjectPartner(req);
  if (partner?.id) req.projectPartnerUser = partner;
  return partner;
};

/**
 * Allows the request only when the logged-in project partner owns the enquiry
 * in req.params[param]. Unknown and other partners' enquiries both give 404,
 * so ids can't be probed.
 */
export const requireEnquiryOwner = (param = "id") =>
  async function enquiryOwnerCheck(req, res, next) {
    try {
      const partner = loggedInPartner(req);
      if (!partner?.id) {
        return res.status(401).json({ message: "Unauthorized. Please log in." });
      }
      const enquiryId = Number(req.params[param]);
      if (!Number.isInteger(enquiryId) || enquiryId <= 0) {
        return res.status(400).json({ message: "Invalid Enquiry ID" });
      }
      if (!(await partnerOwnsEnquiry(enquiryId, partner.id))) {
        return res.status(404).json({ message: "Enquiry not found" });
      }
      return next();
    } catch (err) {
      console.error("requireEnquiryOwner:", err);
      return res.status(500).json({ message: "Enquiry access check failed" });
    }
  };

/**
 * A property put on an enquiry (req.body[field]) must be one of the partner's
 * own properties, the same list the panel offers. Empty values pass.
 */
export const requireOwnPropertyInBody = (field) =>
  async function ownPropertyCheck(req, res, next) {
    try {
      const value = req.body?.[field];
      if (value === undefined || value === null || value === "") return next();
      const partner = loggedInPartner(req);
      if (!partner?.id) {
        return res.status(401).json({ message: "Unauthorized. Please log in." });
      }
      const [rows] = await dbPromise.query(
        `SELECT 1 FROM properties WHERE propertyid = ? AND projectpartnerid = ?
         UNION ALL
         SELECT 1 FROM enquirers WHERE enquirersid = ? AND propertyid = ?
         LIMIT 1`,
        // Keeping the property the enquiry already has is always allowed
        [value, partner.id, req.params.id ?? 0, value],
      );
      if (!rows.length) {
        return res.status(400).json({ message: "Choose one of your own properties." });
      }
      return next();
    } catch (err) {
      console.error("requireOwnPropertyInBody:", err);
      return res.status(500).json({ message: "Property check failed" });
    }
  };

const TEAM_SQL = {
  sales: "SELECT 1 FROM salespersons WHERE salespersonsid = ? AND projectpartnerid = ? LIMIT 1",
  territory: "SELECT 1 FROM territorypartner WHERE id = ? AND projectpartnerid = ? LIMIT 1",
};

/**
 * Assigning an enquiry: the sales/territory partner in req.body[field] must be
 * on the partner's own team (the same list the assign drawers show).
 */
export const requireOwnTeamMemberInBody = (kind, field) =>
  async function ownTeamCheck(req, res, next) {
    try {
      const value = req.body?.[field];
      // Missing values are left to the controller's own "required" message
      if (value === undefined || value === null || value === "") return next();
      const partner = loggedInPartner(req);
      if (!partner?.id) {
        return res.status(401).json({ message: "Unauthorized. Please log in." });
      }
      const [rows] = await dbPromise.query(TEAM_SQL[kind], [value, partner.id]);
      if (!rows.length) {
        return res.status(400).json({
          message: `Choose one of your own ${kind === "sales" ? "sales" : "territory"} partners.`,
        });
      }
      return next();
    } catch (err) {
      console.error("requireOwnTeamMemberInBody:", err);
      return res.status(500).json({ message: "Partner check failed" });
    }
  };

/**
 * New enquiry from the app: the chosen property (req.body.selectedProperty.propertyid)
 * must be the partner's own or publicly listed (the form lists the city's live
 * properties, so partners can bring leads for other listings).
 */
export async function requireUsableSelectedProperty(req, res, next) {
  try {
    const propertyId = req.body?.selectedProperty?.propertyid;
    if (propertyId === undefined || propertyId === null || propertyId === "") return next();
    const partner = loggedInPartner(req);
    if (!partner?.id) {
      return res.status(401).json({ message: "Unauthorized. Please log in." });
    }
    const [rows] = await dbPromise.query(
      `SELECT 1 FROM properties
       WHERE propertyid = ?
         AND (projectpartnerid = ? OR (status = 'active' AND approve = 'Approved'))
       LIMIT 1`,
      [propertyId, partner.id],
    );
    if (!rows.length) {
      return res.status(400).json({ message: "This property is not available. Choose another one." });
    }
    return next();
  } catch (err) {
    console.error("requireUsableSelectedProperty:", err);
    return res.status(500).json({ message: "Property check failed" });
  }
}

/** Meta (Facebook) lead: allowed when it belongs to one of the partner's enquiries. */
export async function requireMetaLeadOwner(req, res, next) {
  try {
    const partner = loggedInPartner(req);
    if (!partner?.id) {
      return res.status(401).json({ message: "Unauthorized. Please log in." });
    }
    const [rows] = await dbPromise.query(
      "SELECT enquirersid FROM enquirers WHERE meta_lead_id = ?",
      [req.params.id],
    );
    for (const row of rows) {
      if (await partnerOwnsEnquiry(row.enquirersid, partner.id)) return next();
    }
    return res.status(404).json({ success: false, message: "Lead not found" });
  } catch (err) {
    console.error("requireMetaLeadOwner:", err);
    return res.status(500).json({ message: "Lead access check failed" });
  }
}
