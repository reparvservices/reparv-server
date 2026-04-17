import express from "express";
import {getAll, getById, status, del, addSubscriber} from "../controllers/subscribersController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:id", getById);
router.post("/add", addSubscriber);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default  router;
