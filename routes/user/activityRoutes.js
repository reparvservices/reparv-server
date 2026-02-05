import express from "express";
import {
  propertyLike,
  blogLike,
  getLikedProperties,
  getEnquiryProperties,
  getVisitedProperties,
  getBookedProperties,
} from "../../controllers/user/activityController.js";

const router = express.Router();

/* ================= LIKE ACTIONS ================= */
router.post("/property-like", propertyLike);
router.post("/blog-like", blogLike);

/* ================= ACTIVITY LISTS ================= */
router.get("/liked/all-properties", getLikedProperties);
router.get("/enquiries/all-properties", getEnquiryProperties);
router.get("/visited/all-properties", getVisitedProperties);
router.get("/booked/all-properties", getBookedProperties);

export default router;