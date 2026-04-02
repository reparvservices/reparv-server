import express from "express";
import {
  getAll,
  getByPage,
} from "../../controllers/frontend/seoData.controller.js";

const router = express.Router();

//router.get("/", getAll);
router.get("/:page", getByPage);

export default router;
