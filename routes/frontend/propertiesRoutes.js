import express from "express";
import {
  getAll,
  getAllBySlug,
  getAllCity,
  getAllLocation,
  getLocationsByCityAndCategory,
  fetchAdditionalInfoForFlat,
  fetchAdditionalInfoForPlot,
  fetchFlatById,
  fetchPlotById,
  getAdditionalInfo,
  getById,
} from "../../controllers/frontend/propertiesController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/get-all-by-slug", getAllBySlug);
router.get("/get/:id", getById);
router.get("/cities", getAllCity);
router.get("/location/all", getAllLocation);
router.get("/location", getLocationsByCityAndCategory);
router.get("/additionalinfo/flat/get/all/:id", fetchAdditionalInfoForFlat);
router.get("/additionalinfo/plot/get/all/:id", fetchAdditionalInfoForPlot);
router.get("/additionalinfo/flat/get/:id", fetchFlatById);
router.get("/additionalinfo/plot/get/:id", fetchPlotById);
router.get("/additionalinfo/data/get/:propertyId", getAdditionalInfo);
export default router;
