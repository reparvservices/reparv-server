import express from "express";
import db from "#db";

const router = express.Router();

// APPLY COUPON
router.post("/apply", async (req, res) => {
  const { coupon, planId, partnerType, user_id } = req.body;

  if (!coupon || !planId || !partnerType || !user_id) {
    return res.status(400).json({
      success: false,
      message: "coupon, planId user_id and partnerType are required",
    });
  }

  const sqlCheckCoupon = `
    SELECT * FROM redeem_codes 
    WHERE redeemCode = ? AND planId = ? AND partnerType = ? AND status = 'Active'
    LIMIT 1
  `;

  db.query(sqlCheckCoupon, [coupon, planId, partnerType], (err, result) => {
    if (err)
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err,
      });

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid, inactive, or not applicable coupon",
      });
    }

    const couponData = result[0];

    const sqlCheckUsage = `SELECT * FROM redeem_used WHERE code = ? AND user_id = ? LIMIT 1`;

    db.query(sqlCheckUsage, [coupon, user_id], (err2, usedRows) => {
      if (err2)
        return res.status(500).json({
          success: false,
          message: "Database error",
          error: err2,
        });

      if (usedRows.length > 0) {
        return res.status(403).json({
          success: false,
          message: "You have already used this coupon",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Coupon applied successfully",
        discount: couponData.discount,
      });
    });
  });
});


router.post("/buy/plan", async (req, res) => {
  try {
    const { partnerIdName, coupon, isUsedCoupon, user_id, planDuration, payment_id, amount } =
      req.body;

    if (!planDuration || !user_id || !payment_id || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const months = parseInt(planDuration);
    if (isNaN(months) || months <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid plan duration" });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    // Insert new subscription
    db.query(
      `INSERT INTO subscriptions (${partnerIdName}, plan, amount, start_date, end_date, payment_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, months, amount, startDate, endDate, payment_id, "Active"],
      (err) => {
        if (err) {
          console.error("Subscription insert error:", err);
          return res.status(500).json({ success: false, message: "Failed to insert subscription" });
        }

        // If coupon is used, update redeem_used
        if (isUsedCoupon === true) {
          db.query(
            "INSERT INTO redeem_used (code, user_id) VALUES (?, ?)",
            [coupon, user_id],
            (err2) => {
              if (err2) {
                return res
                  .status(500)
                  .json({ success: false, message: "Subscription recorded but failed to mark coupon as used" });
              }
              return res.json({
                success: true,
                message: "Subscription purchased and coupon recorded successfully",
              });
            }
          );
        } else {
          return res.json({
            success: true,
            message: "Subscription purchased successfully",
          });
        }
      }
    );
  } catch (error) {
    console.error("Subscription Purchase Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;