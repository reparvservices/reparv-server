import express from "express";
import {getAll, getAllLocation, getLocationsByCityAndCategory} from "../controllers/propertiesController.js";


const router = express.Router();

router.get("/", getAll);
router.get("/location/all", getAllLocation);
router.get("/location", getLocationsByCityAndCategory);
export default  router;