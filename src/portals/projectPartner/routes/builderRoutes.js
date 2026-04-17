import express from "express";
import {
  getAll,
  getAllActive,
  getById,
  add,
  update,
  status,
  assignLogin,
  deleteBuilder,
} from "../controllers/builderController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/active", getAllActive);
router.get("/:id", getById);
router.post("/add", add);
router.put("/edit/:id", update);
router.put("/status/:id", status);
router.put("/assignlogin/:id", assignLogin);
router.delete("/delete/:id", deleteBuilder);

export default router;
