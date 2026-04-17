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

const router = express.Router();
router.post("/add", addEnquiry);
router.get("/get/partnersenquiry/:source/:id", getPartnersEnquiry);
router.get("/get/:source/:id", getAll);
router.get("/enquiry/:id", getAllCreatedEnquiry);
router.post("/assignEnquiry/:id", assignEnquiry);
router.post("/assignEnquryTerritory/:id", assignEnquiryToTerritoryPartner);
router.put("/enquiry/status/:id", status);
router.put("/assign/to/reparv/:id/:enquiryid", assignToReparv);
router.get("/getdigitalenquiry/:id", getAllDigitalEnquiry);
router.get("/remarklist/:id", getRemarkList);
router.post("/create", createEnquiry);

//meta leads
router.get("/meta/:id", getAllLeads);
export default router;
