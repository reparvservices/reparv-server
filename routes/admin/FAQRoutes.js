import express from "express";
import {
  getAll,
  getAllActive,
  getById,
  add,
  update,
  status,
  del,
} from "../../controllers/admin/FAQController.js";

const router = express.Router();

router.get("/:location", getAll);
router.get("/active/:location", getAllActive);
router.get("/:id", getById);
router.post("/add", add);
router.put("/edit/:id", update);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
