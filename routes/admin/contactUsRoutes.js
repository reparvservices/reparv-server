import express from "express";
import {getAll, getById, updateStatus, del} from "../../controllers/admin/contactUsController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.delete("/:id", del);
router.patch("/:id/status", updateStatus);


export default  router;
