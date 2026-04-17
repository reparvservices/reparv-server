import express from "express";
import { accountCancellation } from "../controllers/accountCancellationController.js";

const router = express.Router();

router.post("/cancellation", accountCancellation);

export default router;