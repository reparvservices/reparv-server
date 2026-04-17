import express from "express";
import {
  bookProperty,
  getAllBooking,
} from "../controllers/propertyBookingController.js";

const router = express.Router();

router.post("/bookenquiryproperty", bookProperty);
router.get("/get/:id", getAllBooking);

export default router;
