import express from "express";
import { getAll, } from "../controllers/calenderController.js";

const router = express.Router();

router.get("/meetings", getAll);

export default router;
