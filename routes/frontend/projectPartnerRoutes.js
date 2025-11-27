import express from "express";
import {getAllProperties, getHotDealProperties, getPremiumProperties, getProjectPartnerByContact} from "../../controllers/frontend/projectPartnerController.js";

const router = express.Router();

router.get("/get/:contact", getProjectPartnerByContact);
router.post("/all-properties", getAllProperties);
router.post("/hot-deal-properties", getHotDealProperties);
router.post("/premium-properties", getPremiumProperties);


export default  router;