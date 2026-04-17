import express from "express";
import {getAll, getById, add, update, status, assignLogin, del, getMenus, assignTask} from "../controllers/employeeController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/get/menus", getMenus);
router.get("/:id", getById);
router.post("/add", add);
router.put("/edit/:id", update);
router.put("/status/:id", status);
router.put("/assign/tasks/:id", assignTask);
router.put("/assignlogin/:id", assignLogin);
router.delete("/delete/:id", del);

export default router;
