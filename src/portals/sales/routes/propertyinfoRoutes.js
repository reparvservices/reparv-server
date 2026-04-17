import express from "express";
import {getById, getImages} from "../controllers/propertyinfoController.js";

const router = express.Router();


//router.get("/", getAll);
router.get("/:id", getById);
router.get("/getimages/:id", getImages);

export default  router;