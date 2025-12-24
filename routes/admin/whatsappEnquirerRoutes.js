import express from "express";
import {
  add,
  getAll,
  getById,
  status,
  del,
} from "../../controllers/admin/whatsappEnquirerController.js";

const router = express.Router();

router.post("/add", add);
router.get("/", getAll);
router.get("/:id", getById);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
