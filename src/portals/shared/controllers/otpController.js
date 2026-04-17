import otpStore from "#utils/otpStore.js";
import { sendOtpSMS } from "#utils/sendOtpSMS.js";

export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore.set(phone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 mins
    });

    await sendOtpSMS(phone, otp);
    
    return res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    return res.status(500).json({ message: "Internal server error" });
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

    if (record.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    // OTP verified → remove from store
    otpStore.delete(phone);

    return res.status(200).json({
      success: true,
      message: "OTP verified",
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
