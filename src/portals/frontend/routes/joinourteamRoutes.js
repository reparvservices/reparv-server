import express from "express";
import {getAll, getById, add, status, deleteTeam} from "../controllers/joinourteamController.js";

const router = express.Router();
// router.use(cookieParser());

router.get("/", getAll);
// router.get("/active", getAllActive);
router.get("/:id", getById);
router.post("/add", add);
// router.put("/edit/:id", update);
router.put("/status/:id", status);
// router.put("/assignlogin/:id", assignLogin);
router.delete("/delete/:id", deleteTeam);

export default  router;
