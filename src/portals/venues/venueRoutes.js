import express from "express";
import { requireCustomer } from "../../core/middleware/requireCustomer.js";
import rateLimit from "express-rate-limit";
import {
  searchListings, getPublicListing, getAvailability, quoteForListing, createBooking,
  verifyBookingPayment, listCustomerBookings, cancelBooking, httpError, todayIST,
} from "./venueService.js";
import {
  createListing, updateListing, getOwnListing, listOwnListings, setListingStatus,
  blockDates, unblockDates, listOwnerBookings, adminListListings, adminDecide, adminListBookings,
} from "./venueOwnerService.js";
import { isValidDate, addDays, diffDays } from "./venuePricing.js";

/** Wrap an async handler: business errors carry statusCode, everything else is a 500. */
const h = (fn) => async (req, res) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, ...(data || {}) });
  } catch (err) {
    const status = err?.statusCode && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) console.error("[venues]", err);
    if (!res.headersSent) res.status(status).json({ success: false, message: status >= 500 ? "Something went wrong." : err.message, ...(err.meta || {}) });
  }
};
const id = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, "Invalid id.");
  return n;
};

// ───────────── customer: /customerapp/venues (browse is public, booking needs login) ─────────────

const bookingLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many attempts. Please wait a minute." } });

export const customerVenueRouter = express.Router();
customerVenueRouter.get("/", h(async (req) => searchListings(req.query)));
customerVenueRouter.get("/:id", h(async (req) => ({ listing: await getPublicListing(id(req)) })));
customerVenueRouter.get("/:id/availability", h(async (req) => {
  const from = isValidDate(req.query.from) ? req.query.from : todayIST();
  let to = isValidDate(req.query.to) ? req.query.to : addDays(from, 62);
  if (diffDays(from, to) > 366) to = addDays(from, 366);
  return getAvailability(id(req), from, to);
}));
customerVenueRouter.post("/:id/quote", h(async (req) => quoteForListing(id(req), req.body || {})));

export const customerBookingRouter = express.Router();
customerBookingRouter.use(requireCustomer);
customerBookingRouter.get("/", h(async (req) => ({ bookings: await listCustomerBookings(req.customer.id) })));
customerBookingRouter.post("/", bookingLimiter, h(async (req) => {
  const listingId = Number(req.body?.listing_id);
  if (!Number.isInteger(listingId) || listingId < 1) throw httpError(400, "listing_id is required.");
  return createBooking({ customer: req.customer, listingId, input: req.body });
}));
customerBookingRouter.post("/verify", bookingLimiter, h(async (req) => verifyBookingPayment({ customer: req.customer, ...(req.body || {}) })));
customerBookingRouter.post("/:id/cancel", h(async (req) =>
  cancelBooking({ bookingId: id(req), actor: "customer", customerId: req.customer.id, reason: req.body?.reason })));

// ───────────── partner: /projectpartner/venues (verifyToken has set req.projectPartnerUser) ─────────────

const owner = (req) => {
  const u = req.projectPartnerUser;
  if (!u || u.id === undefined || u.id === null) throw httpError(401, "Unauthorized. Please log in.");
  return { role: "project", id: Number(u.id) };
};

export const partnerVenueRouter = express.Router();
partnerVenueRouter.get("/", h(async (req) => ({ listings: await listOwnListings(owner(req)) })));
partnerVenueRouter.post("/", h(async (req) => ({ listing: await createListing(owner(req), req.body || {}) })));
partnerVenueRouter.get("/bookings", h(async (req) => ({ bookings: await listOwnerBookings(owner(req)) })));
partnerVenueRouter.post("/bookings/:id/cancel", h(async (req) =>
  cancelBooking({ bookingId: id(req), actor: "owner", ownerKey: owner(req), reason: req.body?.reason })));
partnerVenueRouter.get("/:id", h(async (req) => ({ listing: await getOwnListing(owner(req), id(req)) })));
partnerVenueRouter.put("/:id", h(async (req) => ({ listing: await updateListing(owner(req), id(req), req.body || {}) })));
partnerVenueRouter.post("/:id/:action(submit|pause|resume)", h(async (req) => ({ listing: await setListingStatus(owner(req), id(req), req.params.action) })));
partnerVenueRouter.post("/:id/block", h(async (req) => blockDates(owner(req), id(req), req.body || {})));
partnerVenueRouter.post("/:id/unblock", h(async (req) => unblockDates(owner(req), id(req), req.body || {})));

// ───────────── admin: /admin/venues (admin login enforced by verifyToken) ─────────────

export const adminVenueRouter = express.Router();
adminVenueRouter.get("/", h(async (req) => ({ listings: await adminListListings(req.query.status) })));
adminVenueRouter.get("/bookings", h(async () => ({ bookings: await adminListBookings() })));
adminVenueRouter.post("/bookings/:id/cancel", h(async (req) => cancelBooking({ bookingId: id(req), actor: "admin", reason: req.body?.reason })));
adminVenueRouter.post("/:id/decision", h(async (req) => ({ listing: await adminDecide(id(req), req.body || {}) })));
