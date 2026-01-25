import express from "express";
import { submitEmiForm } from "../../controllers/frontend/emiController.js";

const router = express.Router();

router.post('/check-eligibility', submitEmiForm)

export default router;