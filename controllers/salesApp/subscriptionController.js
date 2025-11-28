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
// export const createSubscription = async (req, res) => {
//   try {
//     const { user_id, plan, payment_id, amount } = req.body;
//     console.log("Request Body:", req.body);

//     const months = PLAN_MONTHS[plan];
//     if (!months) return res.status(400).json({ message: "Invalid plan" });

//     const startDate = new Date();
//     const endDate = new Date();
//     endDate.setMonth(endDate.getMonth() + months);

//     // Insert into subscriptions
//     await db.query(
//       `INSERT INTO subscriptions (salespersonid, plan, amount, start_date, end_date, payment_id, status)
//        VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [user_id, plan, amount, startDate, endDate, payment_id, "Active"]
//     );

//     // Update salesperson table
//     await db.query(
//       `UPDATE salespersons 
//        SET paymentstatus = ?, paymentid = ?, amount = ? 
//        WHERE salespersonsid = ?`,
//       ["Success", payment_id, amount, user_id]
//     );

//     res.json({ success: true, message: "Subscription created successfully" });
//   } catch (error) {
//     console.error("Create Subscription Error:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

export const createSubscription = (req, res) => {
  const { user_id, plan, payment_id, amount } = req.body;
  console.log("Request Body:", req.body);

  // 1️⃣ Fetch payment details
  razorpay.payments.fetch(payment_id, (err, payment) => {
    if (err) {
      console.error("Fetch Payment Error:", err);
      return res.status(500).json({ success: false, message: "Payment fetch failed" });
    }

    // 2️⃣ Capture payment if not captured already
    const capturePayment = (callback) => {
      if (payment.captured) return callback(null);

      razorpay.payments.capture(
        payment_id,
        Math.round(amount * 100),
        "INR",
        (err, captureResponse) => {
          if (err || !captureResponse || captureResponse.status !== "captured") {
            console.error("Payment Capture Error:", err || captureResponse);
            return callback("Payment not captured");
          }
          callback(null);
        }
      );
    };

    capturePayment((captureErr) => {
      if (captureErr) {
        return res.status(400).json({
          success: false,
          message: "Payment not captured",
        });
      }

      // 3️⃣ Plan validation
      const months = PLAN_MONTHS[plan];
      if (!months) {
        return res.status(400).json({ message: "Invalid plan" });
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);

      // 4️⃣ Insert subscription
      db.query(
        `INSERT INTO subscriptions 
         (salespersonid, plan, amount, start_date, end_date, payment_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user_id, plan, amount, startDate, endDate, payment_id, "Active"],
        (err) => {
          if (err) {
            console.error("Insert Subscription Error:", err);
            return res.status(500).json({ success: false, message: "DB Insert Error" });
          }

          // 5️⃣ Update salesperson
          db.query(
            `UPDATE salespersons 
             SET paymentstatus = ?, paymentid = ?, amount = ? 
             WHERE salespersonsid = ?`,
            ["Success", payment_id, amount, user_id],
            (err) => {
              if (err) {
                console.error("Update Salesperson Error:", err);
                return res.status(500).json({ success: false, message: "DB Update Error" });
              }

              // 6️⃣ Trial handling
              if (months === 1) {
                db.query(
                  `UPDATE salespersons 
                   SET hasUsedTrial = 1 
                   WHERE salespersonsid = ?`,
                  [user_id],
                  (err) => {
                    if (err) {
                      console.error("Trial Update Error:", err);
                    } else {
                      console.log("Trial plan purchased → hasUsedTrial = 1 updated");
                    }

                    return res.json({
                      success: true,
                      message: "Subscription created successfully",
                    });
                  }
                );
              } else {
                // No trial → finish response
                return res.json({
                  success: true,
                  message: "Subscription created successfully",
                });
              }
            }
          );
        }
      );
    });
  });
};


//  GET USER’S CURRENT SUBSCRIPTION
export const getUserSubscription = (req, res) => {
  const { userId } = req.params;

  db.query(
    `SELECT * FROM subscriptions WHERE salespersonid = ? ORDER BY created_at DESC LIMIT 1`,
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
          `UPDATE salespersons 
           SET paymentstatus = ?, paymentid = ?, amount = ? 
           WHERE salespersonsid = ?`,
          ["Expired", null, 0, userId],
          (err) => {
            if (err) console.error("Error updating salesperson:", err);
          }
        );

        status = "Expired";
      }
      // Active Subscription
      else if (status === "Active") {
        db.query(
          `UPDATE salespersons 
           SET paymentstatus = ?, paymentid = ?, amount = ? 
           WHERE salespersonsid = ?`,
          ["Success", sub.payment_id, sub.amount, userId],
          (err) => {
            if (err) console.error("Error updating salesperson:", err);
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
    [code, planid, "Sales Partner"],
    (err, codes) => {
      if (err) {
        console.log(err,'ddd');
        
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
             console.log(err2,'ddd');
       
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

