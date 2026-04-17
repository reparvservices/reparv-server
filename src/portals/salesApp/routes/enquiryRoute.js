import express from "express";
import {
  addEnquiry,
  assignEnquiry,
  assignToReparv,
  getAll,
  getAllDigitalEnquiry,
  updateEnquiry,
} from "../controllers/enquiryController.js";
const router = express.Router();

router.post("/assign/to/partner/:id", assignEnquiry);
router.get("/getAll/:id", getAll);
router.post("/add/enquiry", addEnquiry);
router.put("/update/enquiry/:id", updateEnquiry);
router.put("/assign/to/reparv/:id/:enquiryid", assignToReparv);
router.get("/getdigitalenquiry/:id",getAllDigitalEnquiry)
export default router;
