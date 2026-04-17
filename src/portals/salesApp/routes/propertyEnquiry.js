import express from "express";
import { add, addEnquiry, updateEnquiry } from "../controllers/propertyEnquiryController.js";
const router = express.Router();

router.post("/add/:id", add);
router.post("/add/enquiry/:id", addEnquiry);
router.put("/update/enquiry/:id", updateEnquiry);

export default router;