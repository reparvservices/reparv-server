import express from "express";
import { add, addLeadNotification, addVisitor, getAll, getBookingOnly, getOwnerEnquiries, getTotalEnquiries, getTotalVisitors, getVisitsOnly } from "../../controllers/customerAppController/enquiryController.js";
import { getPaymentList } from "../../controllers/sales/customerController.js";

const router = express.Router();
router.post('/add',add)
router.get('/get/:id',getAll)
router.get('/getVisitProperty',getVisitsOnly)
router.get('/getBookingProperty',getBookingOnly)
router.get("/payment/get/:id", getPaymentList);
router.post("/add/notify",addLeadNotification
)
router.get("/total/enquiries", getTotalEnquiries);
router.post("/addvisits",addVisitor)
router.get("/getvisits",getTotalVisitors)
router.get("/getvisitors/:id",getOwnerEnquiries)
export default router;
