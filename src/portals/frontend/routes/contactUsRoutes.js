import express from "express";
import { add } from "../controllers/contactUsController.js.js";

const router = express.Router();

router.post("/add", add);

export default router;