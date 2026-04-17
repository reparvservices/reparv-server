import express from "express";
import { addDepartment, del, getAll, status, updateDepartment } from "../controllers/departmentController.js";

const router = express.Router();

router.get("/:id", getAll);
// router.get("/:id", getById);
router.post("/add/:id", addDepartment);
router.put("/edit/:id", updateDepartment);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
