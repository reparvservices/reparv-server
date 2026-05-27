import express from "express";
import {
  getCashFlow,
  getAllocationConfig,
  putAllocationConfig,
  postCostCategory,
  deleteCostCategoryHandler,
  getExpenses,
  postExpense,
  patchExpense,
  removeExpense,
} from "../controllers/cashFlow.controller.js";

const router = express.Router();

router.get("/cash-flow", getCashFlow);
router.get("/allocation-rules", getAllocationConfig);
router.put("/allocation-rules", putAllocationConfig);
router.post("/categories", postCostCategory);
router.delete("/categories/:id", deleteCostCategoryHandler);
router.get("/expenses", getExpenses);
router.post("/expenses", postExpense);
router.patch("/expenses/:id", patchExpense);
router.delete("/expenses/:id", removeExpense);

export default router;
