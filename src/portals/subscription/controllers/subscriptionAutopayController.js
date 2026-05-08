import {
  createAutopaySubscription,
  verifyAutopaySubscription,
} from "../services/autopayService.js";

/**
 * Legacy name retained for compatibility with existing clients.
 */
export const createOrder = async (req, res) => {
  try {
    const result = await createAutopaySubscription(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to create subscription",
      ...(error?.meta || {}),
    });
  }
};

/**
 * Legacy name retained for compatibility with existing clients.
 */
export const verifyPayment = async (req, res) => {
  try {
    const result = await verifyAutopaySubscription(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to verify subscription",
      ...(error?.meta || {}),
    });
  }
};
