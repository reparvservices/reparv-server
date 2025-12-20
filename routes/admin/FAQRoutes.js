import express from "express";
import {
  getAll,
  getAllActive,
  getById,
  add,
  update,
  status,
  del,
  getAllWithLocation,
} from "../../controllers/admin/FAQController.js";

const router = express.Router();

/* FIXED routes first */
router.get("/active/:location", getAllActive);
router.get("/location/:location", getAllWithLocation);
router.get("/:id", getById);
router.get("/", getAll);

router.post("/add", add);
router.put("/edit/:id", update);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;