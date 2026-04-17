import express from "express";
import { getAllBooking } from "../controllers/propertyBookingController.js";

const router = express.Router();

router.get("/get/:id", getAllBooking);

export default router;
