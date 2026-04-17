import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
} from "../controllers/enquirerController.js";

const router = express.Router();

router.get("/get", getAll);

export default router;
