import express from "express";
import {getById, getImages} from "../controllers/propertyinfoController.js";

const router = express.Router();


//router.get("/", getAll);
router.get("/:slug", getById);
router.get("/getimages/:slug", getImages);

export default  router;