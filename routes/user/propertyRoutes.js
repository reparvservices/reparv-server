import express from "express";
import {
  getAll,
  getById,
  getImages,
  addProperty,
  update,
  deleteImages,
  addImages,
  additionalInfoAdd,
  editAdditionalInfo,
  propertyInfo,
  del,
} from "../../controllers/user/propertyController.js";

const router = express.Router();

/* ---------- PROPERTY ROUTES ---------- */
router.get("/", getAll);
router.get("/:id", getById);
router.get("/images/:id", getImages);
router.delete("/images/delete/:id", deleteImages);
router.delete("/delete/:id", del);
router.get("/propertyinfo/:id", propertyInfo);

/* ---------- ADD / EDIT PROPERTY ---------- */
/**
 * Frontend uploads images to S3
 * Frontend sends image URLs in req.body
 */
router.post("/add", addProperty);
router.put("/edit/:id", update);

/* ---------- ADDITIONAL IMAGES ---------- */
/**
 * req.body.images = [url1, url2, url3]
 */
router.post("/addimages", addImages);

/* ---------- ADDITIONAL INFO (Documents URLs) ---------- */
/**
 * owneradhar, ownerpan, schedule, etc → S3 URLs
 */
router.post("/additionalinfoadd", additionalInfoAdd);
router.put("/editadditionalinfo/:id", editAdditionalInfo);

export default router;