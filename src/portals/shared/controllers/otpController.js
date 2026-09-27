import jwt from "jsonwebtoken";
import otpStore from "#utils/otpStore.js";
import { sendOtpSMS } from "#utils/sendOtpSMS.js";
import { sendAuthOtpTemplate } from "#utils/whatsappAdminChat.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes — matches WhatsApp auth template validity
const MAX_VERIFY_ATTEMPTS = 5; // then the code is discarded (stops guessing)
const PHONE_VERIFIED_PURPOSE = "phone_verified";
const PHONE_VERIFIED_TTL = "30m";

/**
 * Check a proof-of-OTP token issued by verifyOtp for this phone number.
 * Used by forms that must come from a verified phone (e.g. site visit booking).
 */
export function isPhoneVerificationValid(token, phone) {
  if (!token || !phone || !process.env.JWT_SECRET) return false;
  try {
    const payload = jwt.verify(String(token), process.env.JWT_SECRET);
    return payload?.purpose === PHONE_VERIFIED_PURPOSE && payload?.phone === String(phone);
  } catch {
    return false;
  }
}

function shouldUseWhatsAppOtp() {
  if (process.env.OTP_VIA_WHATSAPP === "0") return false;
  if (process.env.OTP_VIA_WHATSAPP === "1") return true;
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );
}

export async function deliverOtpToPhone(phone) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
  });

  if (shouldUseWhatsAppOtp()) {
    await sendAuthOtpTemplate({ toDigits: phone, otp });
    return { channel: "whatsapp", message: "OTP sent to your WhatsApp" };
  }

  await sendOtpSMS(phone, otp);
  return { channel: "sms", message: "OTP sent successfully" };
}

export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    const result = await deliverOtpToPhone(phone);
    return res.json({
      success: true,
      message: result.message,
      channel: result.channel,
    });
  } catch (err) {
    console.error("Send OTP Error:", err?.response?.data || err.message || err);

    if (shouldUseWhatsAppOtp()) {
      try {
        const { phone } = req.body;
        const record = otpStore.get(phone);
        if (record?.otp) {
          await sendOtpSMS(phone, record.otp);
          return res.json({
            success: true,
            message: "OTP sent via SMS",
            channel: "sms",
          });
        }
      } catch (smsErr) {
        console.error("Send OTP SMS fallback failed:", smsErr.message);
      }
    }

    return res.status(500).json({
      message: err?.response?.data?.error?.message || err.message || "Failed to send OTP",
    });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!/^\d{10}$/.test(phone) || !otp) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const record = otpStore.get(phone);

    if (!record) {
      return res.status(400).json({ message: "OTP expired or invalid" });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (String(record.otp) !== String(otp)) {
      record.attempts = (record.attempts || 0) + 1;
      if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
        otpStore.delete(phone);
        return res.status(429).json({ message: "Too many wrong attempts. Please request a new OTP." });
      }
      return res.status(401).json({ message: "Invalid OTP" });
    }

    otpStore.delete(phone);

    // Short-lived proof that this phone was verified; forms send it back
    const verificationToken = jwt.sign(
      { phone, purpose: PHONE_VERIFIED_PURPOSE },
      process.env.JWT_SECRET,
      { expiresIn: PHONE_VERIFIED_TTL },
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified",
      verificationToken,
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
