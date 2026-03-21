import db from "../config/dbconnect.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const query = (sql, params) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
  );

const ROLE_TABLE = {
  sales: {
    table: "salespersons",
    pkCol: "salespersonsid",
    emailCol: "email",
    nameCol: "fullname",
    passwordCol: "password",
  },
  territory: {
    table: "territorypartner",
    pkCol: "id",
    emailCol: "email",
    nameCol: "fullname",
    passwordCol: "password",
  },
  project: {
    table: "projectpartner",
    pkCol: "id",
    emailCol: "email",
    nameCol: "fullname",
    passwordCol: "password",
  },
};

// ── Role display metadata for the email ──────────────────────
const ROLE_META = {
  sales: {
    label: "Sales Partner",
    color: "#0BB501",
    gradStart: "#0BB501",
    gradEnd: "#076300",
    lightBg: "#F0FFF4",
    borderColor: "#BBF7D0",
    emoji: "🤝",
    appName: "Reparv Sales App",
  },
  territory: {
    label: "Territory Partner",
    color: "#0078DB",
    gradStart: "#0078DB",
    gradEnd: "#004170",
    lightBg: "#EFF6FF",
    borderColor: "#BFDBFE",
    emoji: "🗺️",
    appName: "Reparv Territory App",
  },
  project: {
    label: "Project Partner",
    color: "#5E23DC",
    gradStart: "#7A5AF8",
    gradEnd: "#5B2EEA",
    lightBg: "#F5F3FF",
    borderColor: "#DDD6FE",
    emoji: "🏗️",
    appName: "Reparv Project App",
  },
};

const normaliseRole = (role) => {
  const map = {
    sales: "sales",
    "Sales Person": "sales",
    "Sales Partner": "sales",
    sales_partner: "sales",
    territory: "territory",
    "Territory Person": "territory",
    "Territory Partner": "territory",
    territory_partner: "territory",
    project: "project",
    "Project Person": "project",
    "Project Partner": "project",
    project_partner: "project",
  };
  return map[role] || map[role?.toLowerCase?.()] || null;
};

const generateOTP = () => crypto.randomInt(100000, 999999).toString();

// ── Mail transporter ──────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────────────────────────────────────
//  BEAUTIFUL ROLE-BRANDED OTP EMAIL
// ─────────────────────────────────────────────────────────────
const sendOTPEmail = async (to, name, otp, role) => {
  const meta = ROLE_META[role] || ROLE_META.project;
  const year = new Date().getFullYear();
  const time = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Build individual digit boxes for OTP
  const otpDigits = otp
    .split("")
    .map(
      (d) => `
        <td style="padding:0 5px;">
          <div style="
            width:46px;
            height:58px;
            background:#ffffff;
            border:2.5px solid ${meta.borderColor};
            border-radius:14px;
            text-align:center;
            line-height:58px;
            font-size:30px;
            font-weight:900;
            color:${meta.color};
            font-family:'Segoe UI',Arial,sans-serif;
            box-shadow:0 4px 12px rgba(0,0,0,0.07);
          ">${d}</div>
        </td>`,
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Reset Your Reparv Password</title>
</head>
<body style="margin:0;padding:0;background:#EEEDF2;font-family:'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEEDF2;padding:48px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">

  <!-- ══ TOP LOGO BAR ══════════════════════════════════════ -->
  <tr>
    <td align="center" style="padding-bottom:20px;">
      <span style="
        font-size:22px;
        font-weight:900;
        letter-spacing:3px;
        color:#1C1C1E;
        text-transform:uppercase;
      ">REPARV</span>
      <span style="
        display:inline-block;
        margin-left:8px;
        background:${meta.lightBg};
        color:${meta.color};
        font-size:11px;
        font-weight:700;
        padding:3px 10px;
        border-radius:20px;
        border:1px solid ${meta.borderColor};
        vertical-align:middle;
        letter-spacing:0.5px;
      ">${meta.emoji} ${meta.label}</span>
    </td>
  </tr>

  <!-- ══ HERO HEADER ═══════════════════════════════════════ -->
  <tr>
    <td style="
      background:linear-gradient(140deg, ${meta.gradStart} 0%, ${meta.gradEnd} 100%);
      border-radius:24px 24px 0 0;
      padding:44px 40px 36px;
      text-align:center;
      position:relative;
      overflow:hidden;
    ">
      <!-- Big lock icon -->
      <div style="
        display:inline-block;
        background:rgba(255,255,255,0.15);
        border:1.5px solid rgba(255,255,255,0.25);
        border-radius:20px;
        width:64px;
        height:64px;
        line-height:64px;
        font-size:32px;
        margin-bottom:18px;
      ">🔐</div>

      <h1 style="
        margin:0 0 10px;
        font-size:28px;
        font-weight:800;
        color:#ffffff;
        letter-spacing:-0.5px;
        line-height:1.2;
      ">Password Reset OTP</h1>

      <p style="
        margin:0;
        font-size:15px;
        color:rgba(255,255,255,0.8);
        line-height:1.5;
      ">
        We received a request to reset your password<br/>
        for your <strong style="color:#fff;">${meta.label}</strong> account
      </p>
    </td>
  </tr>

  <!-- ══ MAIN BODY ══════════════════════════════════════════ -->
  <tr>
    <td style="
      background:#ffffff;
      padding:40px 40px 32px;
      border-left:1px solid #E2E2EA;
      border-right:1px solid #E2E2EA;
    ">

      <!-- Greeting -->
      <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">
        Hi ${name || "Partner"} 👋
      </p>
      <p style="margin:0 0 32px;font-size:14px;color:#6B7280;line-height:1.7;">
        Enter the one-time password below in the <strong>${meta.appName}</strong> to
        complete your password reset. This code is valid for
        <strong style="color:${meta.color};">10 minutes</strong> only.
      </p>

      <!-- OTP label -->
      <p style="
        margin:0 0 14px;
        font-size:11px;
        font-weight:700;
        color:#9CA3AF;
        letter-spacing:1.8px;
        text-transform:uppercase;
      ">One-Time Password</p>

      <!-- OTP digit boxes -->
      <div style="
        background:${meta.lightBg};
        border:1.5px solid ${meta.borderColor};
        border-radius:20px;
        padding:28px 20px 20px;
        text-align:center;
        margin-bottom:32px;
      ">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>${otpDigits}</tr>
        </table>
        <p style="margin:18px 0 0;font-size:12px;color:#9CA3AF;">
          ⏱&nbsp; Expires in <strong style="color:${meta.color};">10 minutes</strong>
          &nbsp;·&nbsp; Do not share with anyone
        </p>
      </div>

      <!-- Account info card -->
      <div style="
        background:#F9FAFB;
        border:1px solid #E5E7EB;
        border-radius:16px;
        padding:20px 22px;
        margin-bottom:28px;
      ">
        <p style="
          margin:0 0 14px;
          font-size:11px;
          font-weight:700;
          color:#9CA3AF;
          letter-spacing:1.5px;
          text-transform:uppercase;
        ">Account Info</p>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid #F3F4F6;">
              <span style="font-size:13px;color:#6B7280;">Name</span>
            </td>
            <td align="right" style="padding:7px 0;border-bottom:1px solid #F3F4F6;">
              <span style="font-size:13px;font-weight:600;color:#111827;">${name || "Partner"}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid #F3F4F6;">
              <span style="font-size:13px;color:#6B7280;">Role</span>
            </td>
            <td align="right" style="padding:7px 0;border-bottom:1px solid #F3F4F6;">
              <span style="
                display:inline-block;
                background:${meta.lightBg};
                color:${meta.color};
                font-size:12px;
                font-weight:700;
                padding:3px 12px;
                border-radius:20px;
                border:1px solid ${meta.borderColor};
              ">${meta.emoji}&nbsp;${meta.label}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid #F3F4F6;">
              <span style="font-size:13px;color:#6B7280;">App</span>
            </td>
            <td align="right" style="padding:7px 0;border-bottom:1px solid #F3F4F6;">
              <span style="font-size:13px;font-weight:600;color:#111827;">${meta.appName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:7px 0;">
              <span style="font-size:13px;color:#6B7280;">Requested at</span>
            </td>
            <td align="right" style="padding:7px 0;">
              <span style="font-size:13px;font-weight:600;color:#111827;">${time} IST</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Security notice -->
      <div style="
        background:#FFFBEB;
        border:1.5px solid #FDE68A;
        border-radius:14px;
        padding:16px 18px;
      ">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;padding-right:12px;font-size:20px;">⚠️</td>
            <td>
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">
                Security Alert
              </p>
              <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
                <strong>Never share this OTP</strong> with anyone — not even Reparv support.
                If you did not request a password reset, please ignore this email.
                Your account remains safe.
              </p>
            </td>
          </tr>
        </table>
      </div>

    </td>
  </tr>

  <!-- ══ FOOTER ══════════════════════════════════════════════ -->
  <tr>
    <td style="
      background:#F3F4F6;
      border:1px solid #E2E2EA;
      border-top:none;
      border-radius:0 0 24px 24px;
      padding:24px 40px;
      text-align:center;
    ">
      <p style="margin:0 0 6px;font-size:13px;color:#6B7280;line-height:1.6;">
        This email was sent because a password reset was requested for a
        <strong>${meta.label}</strong> account registered with this email address.
      </p>
      <p style="margin:0 0 16px;font-size:12px;color:#9CA3AF;">
        If this wasn't you, you can safely ignore this email.
      </p>
      <div style="height:1px;background:#E5E7EB;margin:0 0 16px;"></div>
      <p style="margin:0;font-size:11px;color:#D1D5DB;">
        © ${year} Reparv Technologies Pvt. Ltd. · All rights reserved
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>
  `;

  await transporter.sendMail({
    from: `"Reparv – ${meta.label}" <${process.env.EMAIL_USER}>`,
    to,
    subject: `${meta.emoji} [Reparv] Password Reset OTP – ${meta.label}`,
    html,
  });
};

// ─────────────────────────────────────────────────────────────
// In-memory OTP store
// Key: `${role}:${email}`
// ─────────────────────────────────────────────────────────────
const otpStore = new Map();

// ═════════════════════════════════════════════════════════════
//  STEP 1 — SEND OTP
//  POST /api/auth/forgot-password/send-otp
//  Body: { email, role }
// ═════════════════════════════════════════════════════════════
export const sendForgotPasswordOTP = async (req, res) => {
  const { email, role: rawRole } = req.body;

  console.log("[sendForgotPasswordOTP] email:", email, "role:", rawRole);

  if (!email?.trim())
    return res
      .status(400)
      .json({ success: false, message: "Email is required." });

  const role = normaliseRole(rawRole);
  if (!role)
    return res.status(400).json({ success: false, message: "Invalid role." });

  const cfg = ROLE_TABLE[role];

  try {
    const rows = await query(
      `SELECT \`${cfg.pkCol}\` AS id, \`${cfg.nameCol}\` AS name, \`${cfg.emailCol}\` AS email
       FROM \`${cfg.table}\`
       WHERE \`${cfg.emailCol}\` = ?
       LIMIT 1`,
      [email.trim().toLowerCase()],
    );

    if (!rows.length) {
      console.warn("[sendForgotPasswordOTP] email not found:", email);
      return res.json({
        success: true,
        message: "If this email is registered, an OTP has been sent.",
      });
    }

    const user = rows[0];
    const otp = generateOTP();
    const key = `${role}:${email.trim().toLowerCase()}`;

    otpStore.set(key, {
      otp,
      userId: user.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });

    console.log(`[sendForgotPasswordOTP] OTP for ${email} (${role}): ${otp}`);

    // ✅ role is passed so email is branded for the correct role
    await sendOTPEmail(user.email, user.name, otp, role);

    console.log("[sendForgotPasswordOTP] ✅ email sent to:", email);

    return res.json({
      success: true,
      message: "OTP sent to your registered email address.",
    });
  } catch (err) {
    console.error("[sendForgotPasswordOTP] ❌ error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }
};

// ═════════════════════════════════════════════════════════════
//  STEP 2 — VERIFY OTP
//  POST /api/auth/forgot-password/verify-otp
//  Body: { email, role, otp }
// ═════════════════════════════════════════════════════════════
export const verifyForgotPasswordOTP = (req, res) => {
  const { email, role: rawRole, otp } = req.body;

  console.log(
    "[verifyForgotPasswordOTP] email:",
    email,
    "role:",
    rawRole,
    "otp:",
    otp,
  );

  if (!email || !otp)
    return res
      .status(400)
      .json({ success: false, message: "Email and OTP are required." });

  const role = normaliseRole(rawRole);
  if (!role)
    return res.status(400).json({ success: false, message: "Invalid role." });

  const key = `${role}:${email.trim().toLowerCase()}`;
  const entry = otpStore.get(key);

  if (!entry)
    return res.status(400).json({
      success: false,
      message: "OTP not found. Please request a new one.",
    });

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return res.status(400).json({
      success: false,
      message: "OTP has expired. Please request a new one.",
    });
  }

  if (entry.attempts >= 5) {
    otpStore.delete(key);
    return res.status(400).json({
      success: false,
      message: "Too many incorrect attempts. Please request a new OTP.",
    });
  }

  if (entry.otp !== otp.toString().trim()) {
    entry.attempts += 1;
    otpStore.set(key, entry);
    return res.status(400).json({
      success: false,
      message: `Incorrect OTP. ${5 - entry.attempts} attempt(s) remaining.`,
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  otpStore.set(key, {
    ...entry,
    otp: null,
    resetToken,
    resetExpiresAt: Date.now() + 5 * 60 * 1000,
    verified: true,
  });

  console.log("[verifyForgotPasswordOTP] ✅ OTP verified for:", email);

  return res.json({
    success: true,
    message: "OTP verified successfully.",
    resetToken,
  });
};

// ═════════════════════════════════════════════════════════════
//  STEP 3 — RESET PASSWORD
//  POST /api/auth/forgot-password/reset
//  Body: { email, role, resetToken, newPassword }
// ═════════════════════════════════════════════════════════════
export const resetPassword = async (req, res) => {
  const { email, role: rawRole, resetToken, newPassword } = req.body;

  console.log("[resetPassword] email:", email, "role:", rawRole);

  if (!email || !resetToken || !newPassword)
    return res.status(400).json({
      success: false,
      message: "email, resetToken and newPassword are required.",
    });

  if (newPassword.length < 6)
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters.",
    });

  const role = normaliseRole(rawRole);
  if (!role)
    return res.status(400).json({ success: false, message: "Invalid role." });

  const key = `${role}:${email.trim().toLowerCase()}`;
  const entry = otpStore.get(key);

  if (!entry || !entry.verified)
    return res.status(400).json({
      success: false,
      message: "Invalid or expired session. Please start over.",
    });

  if (entry.resetToken !== resetToken)
    return res
      .status(400)
      .json({ success: false, message: "Invalid reset token." });

  if (Date.now() > entry.resetExpiresAt) {
    otpStore.delete(key);
    return res.status(400).json({
      success: false,
      message: "Reset session expired. Please start over.",
    });
  }

  const cfg = ROLE_TABLE[role];

  try {
    let hashedPassword = newPassword;
    try {
      hashedPassword = await bcrypt.hash(newPassword, 10);
      console.log("[resetPassword] ✅ password hashed with bcrypt");
    } catch {
      console.warn(
        "[resetPassword] ⚠️ bcrypt not available — storing plain password",
      );
    }

    await query(
      `UPDATE \`${cfg.table}\` SET \`${cfg.passwordCol}\` = ? WHERE \`${cfg.pkCol}\` = ?`,
      [hashedPassword, entry.userId],
    );

    otpStore.delete(key);

    console.log(
      "[resetPassword] ✅ password reset for userId:",
      entry.userId,
      "role:",
      role,
    );

    return res.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (err) {
    console.error("[resetPassword] ❌ DB error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again.",
    });
  }
};

// ═════════════════════════════════════════════════════════════
//  RESEND OTP — rate-limited 1 per 60 seconds
//  POST /api/auth/forgot-password/resend-otp
//  Body: { email, role }
// ═════════════════════════════════════════════════════════════
export const resendForgotPasswordOTP = async (req, res) => {
  const { email, role: rawRole } = req.body;

  const role = normaliseRole(rawRole);
  if (!role || !email)
    return res
      .status(400)
      .json({ success: false, message: "email and role are required." });

  const key = `${role}:${email.trim().toLowerCase()}`;
  const entry = otpStore.get(key);

  if (entry && Date.now() < entry.expiresAt - 9 * 60 * 1000) {
    return res.status(429).json({
      success: false,
      message: "Please wait at least 60 seconds before requesting a new OTP.",
    });
  }

  return sendForgotPasswordOTP(req, res);
};
