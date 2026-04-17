import express from "express";
import {getAll, getById, add, status, del} from "../controllers/roleController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.post("/add", add);
router.put("/edit/:id", add);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default  router;
