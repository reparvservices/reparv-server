import express from "express";
import {getAll, getAllByCity, getHotDealProperties, getTopPicksProperties} from "../../controllers/frontend/allPropertiesController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:city", getAllByCity);
router.get("/hot-deal/:city", getHotDealProperties);
router.get("/top-picks/:city", getTopPicksProperties);

export default  router;