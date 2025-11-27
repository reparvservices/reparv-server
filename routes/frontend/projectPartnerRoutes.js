import express from "express";
import {getAllProperties, getProjectPartnerByContact} from "../../controllers/frontend/projectPartnerController.js";

const router = express.Router();

router.get("/get/:contact", getProjectPartnerByContact);
router.post("/all-properties", getAllProperties);

export default  router;