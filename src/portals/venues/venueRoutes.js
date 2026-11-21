import express from "express";
import { requireCustomer } from "../../core/middleware/requireCustomer.js";
import { requireWebsiteCustomer } from "../../core/middleware/requireWebsiteCustomer.js";
import rateLimit from "express-rate-limit";
import {
  searchListings, getPublicListing, getAvailability, quoteForListing, createBooking,
  verifyBookingPayment, listCustomerBookings, cancelBooking, httpError, todayIST,
} from "./venueService.js";
import {
  createListing, updateListing, getOwnListing, listOwnListings, setListingStatus,
  blockDates, unblockDates, listOwnerBookings, adminListListings, adminDecide, adminListBookings,
  adminCreateListing, adminGetListing, adminUpdateListing,
} from "./venueOwnerService.js";
import { isValidDate, addDays, diffDays, refundFor } from "./venuePricing.js";

/** Wrap an async handler: business errors carry statusCode, everything else is a 500. */
export const h = (fn) => async (req, res) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, ...(data || {}) });
  } catch (err) {
    const status = err?.statusCode && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) console.error("[venues]", err);
    // Messages written on purpose (httpError, e.g. "Could not start the payment") are safe to show;
    // anything unexpected stays generic.
    const deliberate = Boolean(err?.statusCode);
    if (!res.headersSent) res.status(status).json({ success: false, message: deliberate || status < 500 ? err.message : "Something went wrong.", ...(err.meta || {}) });
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

// Website booking: same flow as the app, signed in with the website cookie instead of a Bearer token.
// Browsing, availability and quotes stay public under /customerapp/venues.
/** Adds what cancelling would do, so the page can show the refund before the customer confirms. */
export function withCancelPreview(bookings, today = todayIST()) {
  return bookings.map((b) => {
    const cancellable = (b.status === "held" || b.status === "confirmed") && String(b.end_date) >= today;
    const refund = b.status === "confirmed"
      ? refundFor(b.cancellation_policy, b.amount_paid, b.start_date, today)
      : { percent: 0, amount: 0 };
    return { ...b, can_cancel: cancellable, cancel_refund_percent: cancellable ? refund.percent : 0, cancel_refund_amount: cancellable ? refund.amount : 0 };
  });
}

export const websiteBookingRouter = express.Router();
websiteBookingRouter.use(requireWebsiteCustomer());
websiteBookingRouter.get("/", h(async (req) => ({ bookings: withCancelPreview(await listCustomerBookings(req.customer.id)) })));
websiteBookingRouter.post("/", bookingLimiter, h(async (req) => {
  const listingId = Number(req.body?.listing_id);
  if (!Number.isInteger(listingId) || listingId < 1) throw httpError(400, "listing_id is required.");
  return createBooking({ customer: req.customer, listingId, input: req.body });
}));
websiteBookingRouter.post("/verify", bookingLimiter, h(async (req) => verifyBookingPayment({ customer: req.customer, ...(req.body || {}) })));
websiteBookingRouter.post("/:id/cancel", h(async (req) =>
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

// ───────────── website customer: /user/venues (verifyToken has set req.guestUser) ─────────────

const customerOwner = (req) => {
  const u = req.guestUser;
  if (!u || u.id === undefined || u.id === null) throw httpError(401, "Unauthorized. Please log in.");
  return { role: "customer", id: Number(u.id) };
};

export const userVenueRouter = express.Router();
userVenueRouter.get("/", h(async (req) => ({ listings: await listOwnListings(customerOwner(req)) })));
userVenueRouter.post("/", h(async (req) => ({ listing: await createListing(customerOwner(req), req.body || {}) })));
userVenueRouter.get("/:id", h(async (req) => ({ listing: await getOwnListing(customerOwner(req), id(req)) })));
userVenueRouter.put("/:id", h(async (req) => ({ listing: await updateListing(customerOwner(req), id(req), req.body || {}) })));
userVenueRouter.post("/:id/:action(submit|pause|resume)", h(async (req) => ({ listing: await setListingStatus(customerOwner(req), id(req), req.params.action) })));

// ───────────── admin: /admin/venues (admin login enforced by verifyToken) ─────────────

export const adminVenueRouter = express.Router();
adminVenueRouter.get("/", h(async (req) => ({ listings: await adminListListings(req.query.status) })));
adminVenueRouter.get("/bookings", h(async () => ({ bookings: await adminListBookings() })));
adminVenueRouter.post("/bookings/:id/cancel", h(async (req) => cancelBooking({ bookingId: id(req), actor: "admin", reason: req.body?.reason })));
adminVenueRouter.post("/", h(async (req) => ({
  listing: await adminCreateListing(req.body?.owner_id, req.body || {}, req.body?.publish === true),
})));
adminVenueRouter.get("/:id", h(async (req) => ({ listing: await adminGetListing(id(req)) })));
adminVenueRouter.put("/:id", h(async (req) => ({ listing: await adminUpdateListing(id(req), req.body || {}) })));
adminVenueRouter.post("/:id/decision", h(async (req) => ({ listing: await adminDecide(id(req), req.body || {}) })));
