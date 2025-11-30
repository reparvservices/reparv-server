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

export const createSubscription = async (req, res) => {
  try {
    const { user_id, plan, payment_id, amount } = req.body;
    console.log("Request Body:", req.body);

    // 1 Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(payment_id);

    // 2 Capture payment only if not auto-captured
    if (!payment.captured) {
      const captureResponse = await razorpay.payments.capture(
        payment_id,
        Math.round(amount * 100),
        "INR"
      );

      if (captureResponse.status !== "captured") {
        return res
          .status(400)
          .json({ success: false, message: "Payment not captured" });
      }
    }

    // 3 Validate plan
    const months = PLAN_MONTHS[plan];
    if (!months)
      return res.status(400).json({ success: false, message: "Invalid plan" });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // 4 Insert subscription
    await db.promise().query(
      `INSERT INTO subscriptions 
       (territorypartnerid, plan, amount, start_date, end_date, payment_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, plan, amount, startDate, endDate, payment_id, "Active"]
    );

    // 5 Update territory partner
    await db.promise().query(
      `UPDATE territorypartner 
       SET paymentstatus = ?, paymentid = ?, amount = ? 
       WHERE id = ?`,
      ["Success", payment_id, amount, user_id]
    );

    // 6 Trial handling
    if (months === 1) {
      await db.promise().query(
        `UPDATE territorypartner 
         SET hasUsedTrial = 1 
         WHERE id = ?`,
        [user_id]
      );
      console.log("Trial plan purchased → hasUsedTrial = 1 updated");
    }

    // 7 Respond success
    res.json({ success: true, message: "Subscription created successfully" });
  } catch (error) {
    console.error("Create Subscription Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET USER’S CURRENT SUBSCRIPTION
export const getUserSubscription = (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT * FROM subscriptions
    WHERE territorypartnerid = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
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

    // EXPIRED SUBSCRIPTION
    if (new Date(sub.end_date) < now && sub.status !== "Expired") {
      const updateSubSql = `
        UPDATE subscriptions
        SET status = 'Expired'
        WHERE id = ?
      `;
      db.query(updateSubSql, [sub.id], (err) => {
        if (err) console.error("Error updating subscription:", err);
      });

      const updateTerritorySql = `
        UPDATE territorypartner
        SET paymentstatus = ?, paymentid = ?, amount = ?
        WHERE id = ?
      `;
      db.query(updateTerritorySql, ["Expired", null, 0, userId], (err) => {
        if (err) console.error("Error updating Territory:", err);
      });

      status = "Expired";
    }

    // ACTIVE SUBSCRIPTION
    else if (status === "Active") {
      const updateTerritorySql = `
        UPDATE territorypartner
        SET paymentstatus = ?, paymentid = ?, amount = ?
        WHERE id = ?
      `;
      db.query(
        updateTerritorySql,
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
  });
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
