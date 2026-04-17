import express from "express";
import {getData, getCount, getRecentEnquiries} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/", getData);
router.get("/count", getCount);
router.get("/enquiries", getRecentEnquiries);

export default router;
