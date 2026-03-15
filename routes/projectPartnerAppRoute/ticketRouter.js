import express from "express";
import multer from "multer";
import {
  getAll,
  getAdmins,
  getDepartments,
  getEmployees,
  getById,
  changeStatus,
  add,
  update,
  addResponse,
  del,
} from "../../controllers/projectPartnerApp/TicketController.js";

const router = express.Router();

// ── Multer: memory storage for S3 upload ──
const upload = multer({ storage: multer.memoryStorage() });

router.get("/get/:generator/:id/:adharId", getAll);
router.get("/admins", getAdmins);
router.get("/departments", getDepartments);
router.get("/employees/:id", getEmployees);
router.get("/:id", getById);

// ── screenshot is optional — use upload.single() ──
router.post("/add/:adharId", upload.single("screenshot"), add);

router.put("/status/change/:id", changeStatus);
router.put("/edit/:id", update);
router.put("/response/add/:id", addResponse);
router.delete("/delete/:id", del);

export default router;
