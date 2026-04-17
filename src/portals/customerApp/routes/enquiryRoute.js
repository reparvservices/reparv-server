import express from "express";
import {
  add,
  addLeadNotification,
  addVisitor,
  getAll,
  getBookingOnly,
  getOwnerEnquiries,
  getTotalEnquiries,
  getTotalVisitors,
  getVisitsOnly,
  sendOtp,
} from "../controllers/enquiryController.js";
import { getPaymentList } from "../../sales/controllers/customerController.js";

const router = express.Router();
router.post("/add", add);
router.get("/get/:id", getAll);
router.get("/getVisitProperty", getVisitsOnly);
router.get("/getBookingProperty", getBookingOnly);
router.get("/payment/get/:id", getPaymentList);
router.post("/add/notify", addLeadNotification);
router.get("/total/enquiries", getTotalEnquiries);
router.post("/addvisits", addVisitor);
router.get("/getvisits", getTotalVisitors);
router.get("/getvisitors/:id", getOwnerEnquiries);
router.post("/send-otp", sendOtp);
export default router;
