import Razorpay from "razorpay";
import db from "../../config/dbconnect.js";

// PLAN DURATION CONFIG
const PLAN_MONTHS = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  6: 6,
  9: 9,
  12: 12,
  18: 18,
  24: 24,
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

//  CREATE NEW SUBSCRIPTION
//  CREATE NEW SUBSCRIPTION
export const createSubscription = async (req, res) => {
  try {
    const { user_id, plan, payment_id, amount } = req.body;
    console.log("Request Body:", req.body);
//  Capture the payment first
    // Fetch payment details
    const payment = await razorpay.payments.fetch(payment_id);

    // Capture payment only if not auto-captured
    if (!payment.captured) {
      const captureResponse = await razorpay.payments.capture(payment_id, Math.round(amount * 100), "INR");
      if (captureResponse.status !== "captured") {
        return res.status(400).json({ success: false, message: "Payment not captured" });
      }
    }
    const months = PLAN_MONTHS[plan];
    if (!months) return res.status(400).json({ message: "Invalid plan" });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // Insert into subscriptions
    await db.query(
      `INSERT INTO subscriptions (territorypartnerid, plan, amount, start_date, end_date, payment_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, plan, amount, startDate, endDate, payment_id, "Active"]
    );

    // Update Territory table
    await db.query(
      `UPDATE territorypartner
       SET paymentstatus = ?, paymentid = ?, amount = ? 
       WHERE id = ?`,
      ["Success", payment_id, amount, user_id]
    );


     // If plan is 1 month → it's a trial → mark trial as used
    if (months === 1) {
      await db.query(
        `UPDATE territorypartner
         SET hasUsedTrial = 1
         WHERE id = ?`,
        [user_id]
      );

      console.log("Trial plan purchased → hasUsedTrial = 1 updated");
    }
    res.json({ success: true, message: "Subscription created successfully" });
  } catch (error) {
    console.error("Create Subscription Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//  GET USER’S CURRENT SUBSCRIPTION
export const getUserSubscription = (req, res) => {
  const { userId } = req.params;

  db.query(
    `SELECT * FROM subscriptions WHERE territorypartnerid = ? ORDER BY created_at DESC LIMIT 1`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error("DB Error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server error" });
      }

      if (!rows.length) {
        return res.json({
          success: true,
          active: false,
          message: "No subscription found",
        });
      }

      const sub = rows[0];
      const now = new Date();
      let status = sub.status;

      // Expired Subscription
      if (new Date(sub.end_date) < now && sub.status !== "Expired") {
        db.query(
          `UPDATE subscriptions SET status = 'Expired' WHERE id = ?`,
          [sub.id],
          (err) => {
            if (err) console.error("Error updating subscription:", err);
          }
        );

        db.query(
          `UPDATE territorypartner
           SET paymentstatus = ?, paymentid = ?, amount = ? 
           WHERE id = ?`,
          ["Expired", null, 0, userId],
          (err) => {
            if (err) console.error("Error updating Territory:", err);
          }
        );

        status = "Expired";
      }
      // Active Subscription
      else if (status === "Active") {
        db.query(
          `UPDATE territorypartner
           SET paymentstatus = ?, paymentid = ?, amount = ? 
           WHERE id = ?`,
          ["Success", sub.payment_id, sub.amount, userId],
          (err) => {
            if (err) console.error("Error updating Territoryperson:", err);
          }
        );
      }

      res.json({
        success: true,
        active: status === "Active",
        plan: sub.plan,
        amount: sub.amount,
        start_date: sub.start_date,
        end_date: sub.end_date,
        status,
      });
    }
  );
};

export const validateRedeemCode = (req, res) => {
  const { code, user_id, planid } = req.body;
  console.log(req.body);

  if (!code || !user_id || !planid)
    return res
      .status(400)
      .json({ success: false, message: "Code and user ID are required" });

  db.query(
    "SELECT * FROM redeem_codes WHERE redeemCode = ? AND status = 'Active' AND planId = ? AND partnerType = ?",
    [code, planid, "Territory Partner"],
    (err, codes) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Server error",
        });
      }

      if (!codes.length) {
        return res.json({
          success: false,
          message: "Invalid or inactive code",
        });
      }

      const discount = codes[0].discount;

      db.query(
        "SELECT * FROM redeem_used WHERE code = ? AND user_id = ?",
        [code, user_id],
        (err2, usedRows) => {
          if (err2) {
            return res.status(500).json({
              success: false,
              message: "Server error",
            });
          }

          if (usedRows.length > 0) {
            return res.json({
              success: false,
              message: "You have already used this code",
            });
          }

          // Code is valid and unused
          res.json({
            success: true,
            discount,
            message: "Code is valid and discount applied",
          });
        }
      );
    }
  );
};

// MARK CODE AS USED
export const markRedeemUsed = (req, res) => {
  const { code, user_id } = req.body;

  db.query(
    "INSERT INTO redeem_used (code, user_id) VALUES (?, ?)",
    [code, user_id],
    (err) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true });
    }
  );
};
