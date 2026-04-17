import Razorpay from "razorpay";
import crypto from "crypto";
import sendSubscriptionEmail from "#utils/subscriptionMailer.js";
import db from "#db"; // mysql connection
import dotenv from "dotenv";
dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const createOrder = (req, res) => {
  const { amount } = req.body;
  const options = {
    amount: amount * 100,
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    payment_capture: 1,
  };
  console.log('ddd');
  
  razorpay.orders.create(options, (err, order) => {
    if (err) {
      console.error("Razorpay order creation error:", err);
      return res.status(500).json({ error: "Failed to create order" });
    }
    res.json(order);
  });
};

export const verifyPayment = (req, res) => {
  const {
    partnerIdName,
    updatedId,
    database,
    userId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
    user_id,
    plan,
    planId,
    planDuration,
    amount,
    coupon,
    isUsedCoupon,
  } = req.body;

  // Basic validation
  const requiredFields = {
    partnerIdName,
    updatedId,
    database,
    userId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
    user_id,
    plan,
    planId,
    planDuration,
    amount,
  };

  // Check missing fields
  const missingFields = Object.entries(requiredFields)
    .filter(([key, value]) => value === undefined || value === null || value === "")
    .map(([key]) => key);

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
      missingFields,
    });
  }

  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const generatedSignature = hmac.digest("hex");

  if (generatedSignature !== razorpay_signature) {
    db.query(
      `UPDATE ${database} SET paymentstatus = ? WHERE ${updatedId} = ?`,
      ["Pending", userId],
      (err) => {
        if (err) console.error("Error updating pending subscription:", err);
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }
    );
    return;
  }

  // Update user payment
  db.query(
    `UPDATE ${database} SET paymentstatus = 'Success', paymentid = ?, amount = ? WHERE ${updatedId} = ?`,
    [razorpay_payment_id, amount, userId],
    (err) => {
      if (err) {
        console.error("Error updating user payment:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + parseInt(planDuration));

      // Make sure partnerIdName is valid column name
      const insertQuery = `
        INSERT INTO subscriptions (${partnerIdName}, plan, planId, planDuration, amount, start_date, end_date, payment_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      console.log("Inserting subscription:", user_id, plan, planId, planDuration, amount, startDate, endDate);

      db.query(
        insertQuery,
        [user_id, plan, planId, planDuration, amount, startDate, endDate, razorpay_payment_id, "Active"],
        (err) => {
          if (err) {
            console.error("Error inserting subscription:", err.sqlMessage || err);
            return res.status(500).json({ success: false, message: "Server error" });
          }

          if (isUsedCoupon && coupon) {
            db.query(
              "INSERT INTO redeem_used (code, user_id) VALUES (?, ?)",
              [coupon, user_id],
              (err) => {
                if (err) console.error("Error inserting coupon usage:", err.sqlMessage || err);
              }
            );
          }

          sendSubscriptionEmail(email, plan, planDuration, amount)
            .then(() => {
              res.json({ success: true, message: "Subscription activated successfully" });
            })
            .catch((emailErr) => {
              console.error("Email error:", emailErr);
              res.json({ success: true, message: "Subscription activated, email failed" });
            });
        }
      );
    }
  );
};