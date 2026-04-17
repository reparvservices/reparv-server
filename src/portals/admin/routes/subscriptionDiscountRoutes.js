import express from "express";
import {
  getAll,
  getById,
  addDiscount,
  updateDiscount,
  status,
  del,
  checkRedeemCode,
} from "../controllers/subscriptionDiscountController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.post("/check/redeem-code", checkRedeemCode);
router.post("/add", addDiscount);
router.put("/edit/:id", updateDiscount);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
