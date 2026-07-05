import {
  verifyApplePartnerPurchase,
  restoreApplePartnerPurchase,
} from "../services/appleIap.service.js";
import { IOS_PARTNER_SUBSCRIPTION_PRODUCTS } from "../utils/applePartnerProducts.js";

/** GET /apple/products — App Store product catalog for iOS partner subscriptions. */
export async function listApplePartnerProducts(_req, res) {
  return res.status(200).json({
    success: true,
    products: IOS_PARTNER_SUBSCRIPTION_PRODUCTS,
  });
}

/** POST /apple/verify — validate StoreKit purchase and activate subscription (iOS only). */
export async function verifyApplePurchaseCheckout(req, res) {
  try {
    const result = await verifyApplePartnerPurchase(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("verifyApplePurchaseCheckout:", error?.message || error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to verify Apple purchase",
      ...(error?.meta || {}),
    });
  }
}

/** POST /apple/restore — re-link an existing Apple subscription to the signed-in partner. */
export async function restoreApplePurchaseCheckout(req, res) {
  try {
    const result = await restoreApplePartnerPurchase(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("restoreApplePurchaseCheckout:", error?.message || error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to restore Apple purchase",
      ...(error?.meta || {}),
    });
  }
}
