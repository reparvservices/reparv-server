import {
  v2AddProperty,
  v2Update,
} from "../../projectPartner/controllers/propertyController.js";

/**
 * Admin add / edit for the same property form the project partner uses.
 *
 * The partner handlers own the field rules, validation and SQL, so the admin
 * panel saves exactly what the partner panel saves. The only difference is who
 * owns the listing: a partner's own token identifies them, while the admin
 * names the project partner in the request body (`projectpartnerid`).
 */
export const adminV2AddProperty = (req, res) => {
  const partnerId = Number(req.body?.projectpartnerid);
  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return res.status(400).json({
      message: "Select the project partner who owns this property.",
    });
  }
  req.projectPartnerUser = { ...(req.projectPartnerUser || {}), id: partnerId };
  return v2AddProperty(req, res);
};

// Editing needs no owner: the update is keyed by the property id in the URL.
export const adminV2UpdateProperty = (req, res) => v2Update(req, res);
