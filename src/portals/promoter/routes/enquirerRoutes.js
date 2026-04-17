import express from "express";
import {
  getAll,
} from "../controllers/enquirerController.js";

const router = express.Router();

router.get("/get/:source", getAll);

export default router;
