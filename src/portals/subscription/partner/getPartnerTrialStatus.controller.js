import { getPartnerTrialStatus } from "../services/subscriptionTrial.service.js";

/**
 * GET /…/subscription/trial-status/:userId
 */
export const buildGetPartnerTrialStatusHandler = (role) => async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const result = await getPartnerTrialStatus({ userId, role });
    return res.status(200).json(result);
  } catch (error) {
    console.error("getPartnerTrialStatus:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to fetch trial status",
    });
  }
};
