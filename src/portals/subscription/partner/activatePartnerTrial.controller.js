import { activatePartnerTrial } from "../services/subscriptionTrial.service.js";

/**
 * POST /…/subscription/activate-trial/:userId
 * Body: { plan_id: number }
 */
export const buildActivatePartnerTrialHandler = (role) => async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    const planId =
      Number.parseInt(req.body?.plan_id, 10) ||
      Number.parseInt(req.body?.planId, 10);

    if (!userId) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "plan_id is required",
      });
    }

    const result = await activatePartnerTrial({
      userId,
      role,
      planId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("activatePartnerTrial:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to activate trial",
    });
  }
};
