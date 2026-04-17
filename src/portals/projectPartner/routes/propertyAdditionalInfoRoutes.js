import express from "express";
import {
  getAll,
  add,
  edit,
  getById,
  status,
  reserved,
  del,
  deleteAllData,
} from "../controllers/propertyAdditionalInfoController.js";

const router = express.Router();

router.get("/:propertyid", getAll);
router.get("/get/:id", getById);
router.post("/add/:id", add);
router.put("/edit/:id", edit);
router.put("/status/:id", status);
router.put("/reserved/:id", reserved);
router.delete("/delete/:id", del);
router.delete("/all/delete/:id", deleteAllData);

export default router;
