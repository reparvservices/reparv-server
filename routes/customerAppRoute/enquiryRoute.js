import express from "express";
import { add, addLeadNotification, getAll, getBookingOnly, getVisitsOnly } from "../../controllers/customerAppController/enquiryController.js";
import { getPaymentList } from "../../controllers/sales/customerController.js";

const router = express.Router();
router.post('/add',add)
router.get('/get',getAll)
router.get('/getVisitProperty',getVisitsOnly)
router.get('/getBookingProperty',getBookingOnly)
router.get("/payment/get/:id", getPaymentList);
router.post("/add/notify",addLeadNotification
)
export default router;
