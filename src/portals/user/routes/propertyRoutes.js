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
  checkPropertyName,
} from "../controllers/propertyController.js";

import {
  ownsPropertyParam,
  ownsPropertyBody,
  ownsImageParam,
  ownsInfoParam,
} from "../../../core/middleware/requireListingOwner.js";

const router = express.Router();

/* ---------- PROPERTY ROUTES ---------- */
router.get("/", getAll);
// Must stay above "/:id"
router.get("/check-name", checkPropertyName);
router.get("/:id", ownsPropertyParam, getById);
router.get("/images/:id", ownsPropertyParam, getImages);
router.delete("/images/delete/:id", ownsImageParam, deleteImages);
router.delete("/delete/:id", ownsPropertyParam, del);
router.get("/propertyinfo/:id", ownsPropertyParam, propertyInfo);

/* ---------- ADD / EDIT PROPERTY ---------- */
/**
 * Frontend uploads images to S3
 * Frontend sends image URLs in req.body
 */
router.post("/add", addProperty);
router.put("/edit/:id", update); // checks ownership itself

/* ---------- ADDITIONAL IMAGES ---------- */
/**
 * req.body.images = [url1, url2, url3]
 */
router.post("/addimages", ownsPropertyBody, addImages);

/* ---------- ADDITIONAL INFO (Documents URLs) ---------- */
/**
 * owneradhar, ownerpan, schedule, etc → S3 URLs
 */
router.post("/additionalinfoadd", ownsPropertyBody, additionalInfoAdd);
router.put("/editadditionalinfo/:id", ownsInfoParam, editAdditionalInfo);

export default router;