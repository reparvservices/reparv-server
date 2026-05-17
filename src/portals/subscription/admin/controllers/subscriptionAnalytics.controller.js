import { getSubscriptionAnalytics } from "../../services/subscriptionAnalytics.service.js";

/**
 * GET /admin/subscription/analytics
 * Query: year (number), month (1-12, optional — drill into one month)
 */
export const getAnalytics = async (req, res) => {
  try {
    const data = await getSubscriptionAnalytics({
      year: req.query.year,
      month: req.query.month,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("getSubscriptionAnalytics:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to load subscription analytics",
    });
  }
};
