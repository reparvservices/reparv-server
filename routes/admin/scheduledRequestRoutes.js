import express from "express";
import {getAll, getById, status, del} from "../../controllers/admin/scheduledRequestController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default  router;
