import db from "#db";
import moment from "moment-timezone";
import { isPartnerSubscriptionAccessActive } from "../utils/subscriptionAccess.js";

const formatStatus = (s) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/**
 * Express handler factory: latest `user_subscriptions` row for a partner role (with plan join).
 * @param {string} role — `sales` | `territory` | `project` | `onboarding`
 */
export const buildPartnerSubscriptionHandler =
  (role) =>
  (req, res) => {
    const { userId } = req.params;

    const sql = `
      SELECT us.*, sp.duration, sp.plan_name, sp.price, sp.billing_cycle, sp.plan_type
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = ? AND us.role = ?
      ORDER BY COALESCE(us.updated_at, us.created_at) DESC, us.id DESC
      LIMIT 1
    `;

    db.query(sql, [userId, role], (err, rows) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      if (!rows.length) {
        return res.json({
          success: true,
          active: false,
          message: "No subscription found",
        });
      }

      let sub = rows[0];
      const statusLower = String(sub.status || "").toLowerCase();
      const trialEnded =
        statusLower === "trial" &&
        sub.end_date &&
        new Date(sub.end_date) < new Date();

      if (trialEnded) {
        db.query(
          `UPDATE user_subscriptions SET status = 'expired', updated_at = NOW() WHERE id = ?`,
          [sub.id],
          () => {},
        );
        sub = { ...sub, status: "expired" };
      }

      const active = isPartnerSubscriptionAccessActive(sub);
      const isTrialPlan =
        statusLower === "trial" ||
        String(sub.plan_type || "").toLowerCase() === "trial";

      const planDuration = isTrialPlan
        ? `${sub.duration} Day${Number(sub.duration) > 1 ? "s" : ""}`
        : sub.billing_cycle === "yearly"
          ? `${sub.duration} Year${Number(sub.duration) > 1 ? "s" : ""}`
          : `${sub.duration} Month${Number(sub.duration) > 1 ? "s" : ""}`;

      return res.json({
        success: true,
        active,
        plan: sub.duration,
        plan_id: sub.plan_id,
        plan_name: sub.plan_name,
        planDuration,
        billing_cycle: sub.billing_cycle,
        amount: sub.final_amount,
        start_date: sub.start_date
          ? moment.utc(sub.start_date).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
          : null,
        end_date: sub.end_date
          ? moment.utc(sub.end_date).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
          : null,
        next_billing_date: sub.next_billing_date
          ? moment.utc(sub.next_billing_date).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
          : null,
        status: formatStatus(sub.status),
        razorpay_subscription_id: sub.razorpay_subscription_id,
      });
    });
  };

/** @deprecated Use `buildPartnerSubscriptionHandler`. */
export const createGetUserSubscription = buildPartnerSubscriptionHandler;
