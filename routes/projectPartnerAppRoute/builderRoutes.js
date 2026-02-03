import express from "express";
import { add, assignLogin, deleteBuilder, getAll, getAllActive, getById, status, update } from "../../controllers/projectPartnerApp/builderController.js";

const router = express.Router();

router.get("/:id", getAll);
router.get("/active/:id", getAllActive);
router.get("/:id", getById);
router.post("/add", add);
router.put("/edit/:id", update);
router.put("/status/:id", status);
router.put("/assignlogin/:id", assignLogin);
router.delete("/delete/:id", deleteBuilder);

export default  router;
