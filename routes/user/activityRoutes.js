import express from "express";
import { propertyLike, blogLike } from "../../controllers/user/activityController.js";

const router = express.Router();

router.post("/property-like", propertyLike);
router.post("/blog-like", blogLike);

export default router;