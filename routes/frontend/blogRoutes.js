import express from "express";
import {addFeedback, getAll,getById} from "../../controllers/frontend/blogController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/details/:slug", getById);
router.post("/feedback/add", addFeedback);
export default  router;