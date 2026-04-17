import express from "express";
import {getAll, getAdmins, getDepartments, getEmployees, getById, changeStatus, add, update, addResponse, del } from "../controllers/ticketController.js";

const router = express.Router();

router.get("/get/:generator", getAll);
router.get("/admins", getAdmins);
router.get("/departments", getDepartments);
router.get("/employees/:id", getEmployees);
router.get("/:id", getById);
router.post("/add", add);
router.put("/status/change/:id", changeStatus);
router.put("/edit/:id", update);
router.put("/response/add/:id", addResponse);
router.delete("/delete/:id", del);

export default router;
