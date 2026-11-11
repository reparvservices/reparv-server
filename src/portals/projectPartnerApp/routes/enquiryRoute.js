import express from "express";
import {
  addEnquiry,
  assignEnquiry,
  assignEnquiryToTerritoryPartner,
  assignToReparv,
  createEnquiry,
  getAll,
  getAllCreatedEnquiry,
  getAllDigitalEnquiry,
  getAllLeads,
  getPartnersEnquiry,
  getRemarkList,
  status,
} from "../controllers/enquiryController.js";
import {
  requireProjectPartner,
  requireSameProjectPartner,
} from "../../../core/middleware/verifyToken.js";
import {
  requireEnquiryOwner,
  requireMetaLeadOwner,
  requireOwnTeamMemberInBody,
  requireUsableSelectedProperty,
} from "../../../core/middleware/requireEnquiryOwner.js";

const router = express.Router();

// These routes sit on the public list (verifyToken skips them), so every one
// needs the partner login here. ":id" partner ids must be the logged-in
// partner, and enquiry ids must be one of their enquiries.
router.use(requireProjectPartner);
const self = requireSameProjectPartner;
const owner = requireEnquiryOwner("id");
// New enquiries always belong to the logged-in partner, never a body value
const asLoggedInPartner = (req, res, next) => {
  req.body = { ...req.body, projectpartnerid: req.projectPartnerUser.id };
  next();
};
router.post("/add", asLoggedInPartner, addEnquiry);
router.get("/get/partnersenquiry/:source/:id", self, getPartnersEnquiry);
router.get("/get/:source/:id", self, getAll);
router.get("/enquiry/:id", self, getAllCreatedEnquiry);
router.post(
  "/assignEnquiry/:id",
  owner,
  requireOwnTeamMemberInBody("sales", "salespersonid"),
  assignEnquiry,
);
router.post(
  "/assignEnquryTerritory/:id",
  owner,
  requireOwnTeamMemberInBody("territory", "territorypartnerid"),
  assignEnquiryToTerritoryPartner,
);
router.put("/enquiry/status/:id", owner, status);
router.put(
  "/assign/to/reparv/:id/:enquiryid",
  self,
  requireEnquiryOwner("enquiryid"),
  assignToReparv,
);
router.get("/getdigitalenquiry/:id", self, getAllDigitalEnquiry);
router.get("/remarklist/:id", owner, getRemarkList);
router.post("/create", asLoggedInPartner, requireUsableSelectedProperty, createEnquiry);

//meta leads
router.get("/meta/:id", requireMetaLeadOwner, getAllLeads);
export default router;
