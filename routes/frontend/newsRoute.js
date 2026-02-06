import express from "express";
import { getAll,getById} from "../../controllers/frontend/newsController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/details/:slug", getById);

export default  router;