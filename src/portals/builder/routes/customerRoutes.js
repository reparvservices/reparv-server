import express from "express";

import {
  getAll,
  getById,
  getPaymentList,
} from "../controllers/customerController.js";
const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.get("/payment/get/:id", getPaymentList);
export default router;
