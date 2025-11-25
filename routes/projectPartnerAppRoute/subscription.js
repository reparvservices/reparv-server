import express from "express";

import Razorpay from "razorpay";
import db from "../../config/dbconnect.js";
import {
  createSubscription,
  getUserSubscription,
  markRedeemUsed,
  validateRedeemCode,
} from "../../controllers/projectPartnerApp/subscriptionController.js";

const router = express.Router();

router.post("/create", createSubscription);
router.get("/user/:userId", getUserSubscription);
router.post("/validate", validateRedeemCode);
router.post("/mark-used", markRedeemUsed);
router.get("/trial-status/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT trialUsed, trialStart, trialEnd FROM user_trials WHERE userId = ? LIMIT 1",
    [id],
    (err, rows) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      // Trial never used
      if (!rows.length) {
        return res.json({
          trialUsed: false,
          trialActive: false,
          daysLeft: 0,
        });
      }

      const data = rows[0];
      let trialActive = false;
      let daysLeft = 0;

      if (data.trialStart && new Date() < new Date(data.trialEnd)) {
        trialActive = true;

        const diff = new Date(data.trialEnd) - new Date();
        daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      res.json({
        trialUsed: data.trialUsed == 1,
        trialActive,
        daysLeft,
      });
    }
  );
});


router.post("/activate-trial/:id", (req, res) => {
  const { id } = req.params;

  // First check if trial already used
  db.query(
    "SELECT trialUsed FROM user_trials WHERE userId = ? LIMIT 1",
    [id],
    (err, rows) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      // Trial already used → block activation
      if (rows.length && rows[0].trialUsed == 1) {
        return res.json({
          success: false,
          message: "Trial already used.",
          trialActive: false,
        });
      }

      // Activate new trial
      const trialStart = new Date();
      const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      db.query(
        `INSERT INTO user_trials (userId, trialUsed, trialStart, trialEnd)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE trialUsed = 1`,
        [id, trialStart, trialEnd],
        (err2) => {
          if (err2) {
            console.error("DB Error:", err2);
            return res.status(500).json({ error: "Database error" });
          }

          res.json({
            success: true,
            trialActive: true,
            trialStart,
            trialEnd,
          });
        }
      );
    }
  );
});


export default router;
