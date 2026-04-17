import express from "express";
import {getAll, getById, status, del, updateDepartment, addDepartment} from "../controllers/departmentController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.post("/add", addDepartment);
router.put("/edit/:id", updateDepartment);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
