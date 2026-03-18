import express from "express";
import {
  addEnquiry,
  assignToReparv,
  getAll,
  getAllDigitalEnquiry,
  oldaddEnquiry,
  updateEnquiry,
} from "../../controllers/territoryApp/enquiryController.js";

const router = express.Router();

router.get("/getAll/:id", getAll);
router.post("/add/enquiry", oldaddEnquiry);
router.post("/add/:id", addEnquiry);
router.put("/update/enquiry/:id", updateEnquiry);
router.put("/assign/to/reparv/:id/:enquiryid", assignToReparv);
router.get("/getdigitalenquiry/:id", getAllDigitalEnquiry);
export default router;
