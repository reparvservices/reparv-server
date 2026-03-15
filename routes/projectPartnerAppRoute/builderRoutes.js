import express from "express";
import {
  add,
  assignLogin,
  checkDuplicate,
  deleteBuilder,
  getAll,
  getAllActive,
  getById,
  status,
  update,
} from "../../controllers/projectPartnerApp/builderController.js";
import multer from "multer";

const router = express.Router();
// ---------------- MULTER MEMORY STORAGE ----------------
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 55 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only WEBP, JPEG, PNG, JPG allowed"));
    }

    cb(null, true);
  },
});

router.post("/add", upload.single("logo"), add);
router.get("/:id", getAll);
router.get("/active/:id", getAllActive);
router.get("/:id", getById);
router.post("/check-duplicate", checkDuplicate);
router.put("/edit/:id", update);
router.put("/status/:id", status);
router.put("/assignlogin/:id", assignLogin);
router.delete("/delete/:id", deleteBuilder);

export default router;
