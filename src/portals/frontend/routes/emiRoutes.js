import express from "express";
import { submitEmiForm } from "../controllers/emiController.js";

const router = express.Router();

router.post('/check-eligibility', submitEmiForm)

export default router;