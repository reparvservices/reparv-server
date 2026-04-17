import express from "express";
import { generateSignedUrl } from "../controllers/s3Controller.js";

const router = express.Router();

router.post("/signed-url/get", generateSignedUrl);

export default router;