import Razorpay from "razorpay";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import sendEmail from "../utils/nodeMailer.js";
import db from "../config/dbconnect.js";
import dotenv from "dotenv";
dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Verifies whether a Razorpay payment ID is valid and captured.
 * @param {string} paymentId - The Razorpay payment ID to verify.
 * @returns {object} - Returns the full payment object if valid and captured.
 * @throws {Error} - Throws an error if payment ID is invalid or not captured.
 */

export const verifyRazorpayPayment = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    if (!payment || payment.status !== "captured") {
      throw new Error("Invalid or unconfirmed Razorpay Payment ID");
    }
    return payment;
  } catch (error) {
    throw new Error("Invalid Razorpay Payment ID");
  }
};

export const createOrder = async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount * 100,
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    payment_capture: 1,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
};

export const verifyPayment = async (req, res) => {
  const {
    updatedId,
    database,
    user_id,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    student_id,
    username,
    password,
    amount,
    role,
    url,
  } = req.body;

  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const generatedSignature = hmac.digest("hex");
  console.log("update", updatedId);

  if (generatedSignature === razorpay_signature) {
    const extractNameFromEmail = (email) => {
      if (!email) return "";

      const namePart = email.split("@")[0]; // part before @
      const lettersOnly = namePart.match(/[a-zA-Z]+/); // match only letters

      if (!lettersOnly) return "";

      const name = lettersOnly[0].toLowerCase();
      return name.charAt(0).toUpperCase() + name.slice(1);
    };
    //const username = extractNameFromEmail(student_id);

    const generatePassword = () => {
      const chars =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
      let password = "";
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };
    //const password = generatePassword();
    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `UPDATE ${database} SET loginstatus = 'Active', username = ?, password = ?, paymentstatus = ?, paymentid = ?, amount = ? WHERE ${updatedId} = ?`;
    const paymentStatus = "Success";

    db.query(
      query,
      [
        username,
        hashedPassword,
        paymentStatus,
        razorpay_payment_id,
        amount,
        user_id,
      ],
      (err, results) => {
        if (err) throw err;
        console.log("Rows updated:", results.affectedRows);
      }
    );
    // Send email after successful update
    sendEmail(student_id, username, password, role, url);
    res.json({ success: true });
  } else {
    const query = `UPDATE ${database} SET paymentstatus = ? WHERE ${updatedId} = ?`;
    db.query(query, ["Pending", user_id], (err, results) => {
      if (err) throw err;
      console.log("Rows updated:", results.affectedRows);
    });
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
};
