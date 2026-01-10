import express from "express";
import { getAllCity, getCityWiseProperties } from "../../controllers/user/mapController.js";

const router = express.Router();

router.get("/properties/cities/", getAllCity);
router.get("/properties/get/:city", getCityWiseProperties);

export default  router;
