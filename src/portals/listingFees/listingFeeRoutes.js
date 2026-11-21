import express from "express";
import { requireWebsiteCustomer } from "../../core/middleware/requireWebsiteCustomer.js";
import { h } from "../venues/venueRoutes.js";
import { httpError } from "../venues/venueService.js";
import {
  quoteForUser, createFeeOrder, verifyFeePayment,
  adminGetConfig, adminSaveSettings, adminSaveRule, adminDeleteRule, adminListPayments,
} from "./listingFeeService.js";

const positiveInt = (v, what) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, `${what} is required.`);
  return n;
};

// ───────────── website user: /user/listing-fees (website login) ─────────────
export const userListingFeeRouter = express.Router();
userListingFeeRouter.use(requireWebsiteCustomer());

// What would a listing of this type cost me right now?  ?listingType=Sell&category=NewFlat
userListingFeeRouter.get("/quote", h(async (req) =>
  ({ quote: await quoteForUser(req.customer.id, { listingType: String(req.query.listingType || ""), category: String(req.query.category || "") }) })));

// Open a payment for one of my unpaid listings
userListingFeeRouter.post("/checkout", h(async (req) =>
  createFeeOrder({ userId: req.customer.id, propertyId: positiveInt(req.body?.property_id, "property_id") })));

userListingFeeRouter.post("/verify", h(async (req) =>
  verifyFeePayment({ userId: req.customer.id, ...(req.body || {}) })));

// ───────────── admin: /admin/listing-fees (admin login enforced by verifyToken) ─────────────
export const adminListingFeeRouter = express.Router();
adminListingFeeRouter.get("/", h(async () => adminGetConfig()));
adminListingFeeRouter.put("/settings", h(async (req) => ({ settings: await adminSaveSettings(req.body || {}) })));
adminListingFeeRouter.post("/rules", h(async (req) => ({ rules: await adminSaveRule(req.body || {}) })));
adminListingFeeRouter.delete("/rules/:id", h(async (req) => ({ rules: await adminDeleteRule(positiveInt(req.params.id, "id")) })));
adminListingFeeRouter.get("/payments", h(async (req) => ({ payments: await adminListPayments(req.query.limit) })));
