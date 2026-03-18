import express from "express";
import {getBookedProperties, getCount, getProperties, getRecentEnquiries } from "../../controllers/projectPartner/dashboardController.js";

const router = express.Router();

router.get("/count", getCount);

router.get("/enquiries", getRecentEnquiries);
router.get("/properties", getProperties);
router.get("/properties/booked", getBookedProperties);

export default router;
