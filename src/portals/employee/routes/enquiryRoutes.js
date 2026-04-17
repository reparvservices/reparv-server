import express from "express";
import { addEnquiry, updateEnquiry } from "../controllers/enquiryController.js";

const router = express.Router();

router.post("/add/enquiry", addEnquiry);
router.put("/update/enquiry/:id", updateEnquiry);
export default router;
