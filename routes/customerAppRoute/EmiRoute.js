import express from "express";
import { getLoansByUserId, getUserLoanCounts, submitEmiForm } from "../../controllers/customerAppController/loanEmiController.js";


const router = express.Router();

router.post('/emiform',submitEmiForm)
router.get("/counts/:user_id", getUserLoanCounts);
router.get("/loan-applications/:user_id", getLoansByUserId);

export default router;
