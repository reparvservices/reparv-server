import { cancelUserSubscription } from "../services/subscriptionCancel.service.js";

function resolveAuthPartner(req, role) {
  if (role === "project") return req.projectPartnerUser;
  if (role === "sales") return req.salesUser;
  if (role === "territory") return req.territoryUser;
  return null;
}

/**
 * POST /:portal/subscription/cancel/:userId
 * Body: { cancel_at_cycle_end?: boolean } — default true
 */
export function buildCancelPartnerSubscriptionHandler(role) {
  return async (req, res) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!userId) {
        return res.status(400).json({ success: false, message: "Invalid user id" });
      }

      const partner = resolveAuthPartner(req, role);
      if (!partner?.id || Number(partner.id) !== userId) {
        return res.status(403).json({
          success: false,
          message: "You can only cancel your own subscription.",
        });
      }

      const cancelAtCycleEnd =
        req.body?.cancel_at_cycle_end !== false && req.body?.cancel_at_cycle_end !== 0;

      const result = await cancelUserSubscription({
        userId,
        role,
        cancelAtCycleEnd,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(`cancelPartnerSubscription (${role}):`, error);
      return res.status(error?.statusCode || 500).json({
        success: false,
        message: error?.message || "Failed to cancel subscription",
      });
    }
  };
}
