import express from "express";
import {
  fetchAdditionalInfo,
  getAll,
  getById,
  updateStatus,
} from "../controllers/propertyController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.get("/additionalinfo/get/:id", fetchAdditionalInfo);
router.put("/updatepropertyinfo/:id", updateStatus);

export default router;
