import express from "express";
import { add, assignLogin, getAll, status,del,update, assignTask } from "../controllers/employeeController.js";

const router = express.Router();

router.post('/add',add);
router.get('/getemployee/:id',getAll)
router.put("/status/:id", status);
router.put("/assignlogin/:id", assignLogin);
router.put("/edit/:id", update);
router.delete("/delete/:id", del);
router.put("/assign/tasks/:id", assignTask);
export default router;
