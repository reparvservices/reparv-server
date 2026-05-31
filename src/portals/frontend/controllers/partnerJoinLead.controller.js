import moment from "moment-timezone";
import otpStore from "#utils/otpStore.js";
import { sendOtpSMS } from "#utils/sendOtpSMS.js";
import { deliverOtpToPhone } from "../../shared/controllers/otpController.js";
import {
  normalizeContact,
  verifyOtpFromStore,
  partnerContactAlreadyRegistered,
  validateContactForPartnerJoin,
  upsertPartnerJoinLead,
  markWhatsAppSent,
  getPartnerJoinLeadByToken,
  sendPartnerJoinWhatsApp,
} from "../services/partnerJoinLead.service.js";

export const sendPartnerJoinLeadOtp = async (req, res) => {
  try {
    const contact = normalizeContact(req.body?.phone);
    if (!contact) {
      return res.status(400).json({ success: false, message: "Invalid phone number" });
    }

    const validation = await validateContactForPartnerJoin(contact);
    if (!validation.ok) {
      return res.status(validation.status || 409).json({
        success: false,
        message: validation.message,
      });
    }

    const result = await deliverOtpToPhone(contact);
    return res.json({
      success: true,
      message: result.message,
      channel: result.channel,
    });
  } catch (err) {
    console.error("[sendPartnerJoinLeadOtp]", err?.response?.data || err.message || err);

    try {
      const contact = normalizeContact(req.body?.phone);
      const record = contact ? otpStore.get(contact) : null;
      if (record?.otp) {
        await sendOtpSMS(contact, record.otp);
        return res.json({
          success: true,
          message: "OTP sent via SMS",
          channel: "sms",
        });
      }
    } catch (smsErr) {
      console.error("[sendPartnerJoinLeadOtp] SMS fallback failed:", smsErr.message);
    }

    return res.status(500).json({
      success: false,
      message:
        err?.response?.data?.error?.message || err.message || "Failed to send OTP",
    });
  }
};

export const completePartnerJoinLead = async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const contact = normalizeContact(req.body?.phone);
    const otp = String(req.body?.otp || "").trim();

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "First name and last name are required" });
    }
    if (!contact) {
      return res.status(400).json({ success: false, message: "Invalid phone number" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const otpCheck = verifyOtpFromStore(contact, otp);
    if (!otpCheck.ok) {
      return res.status(401).json({ success: false, message: otpCheck.message });
    }

    if (await partnerContactAlreadyRegistered(contact)) {
      return res.status(409).json({
        success: false,
        message: "This number is already registered as a Reparv Partner. Please login in the app.",
      });
    }

    const now = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    await upsertPartnerJoinLead({ firstName, lastName, contact, now });

    let whatsappSent = true;
    let whatsappWarning = null;
    try {
      await sendPartnerJoinWhatsApp({ contact, firstName });
      await markWhatsAppSent(contact, now);
    } catch (waErr) {
      whatsappSent = false;
      whatsappWarning =
        "Your details were saved, but we could not send the WhatsApp message. Please try again later.";
      console.error("[completePartnerJoinLead] WhatsApp template failed:", waErr.message);
    }

    return res.status(200).json({
      success: true,
      message: whatsappSent
        ? "Check WhatsApp — we sent you the Reparv Partner app link."
        : whatsappWarning,
      whatsappSent,
    });
  } catch (err) {
    console.error("[completePartnerJoinLead]", err);
    if (err?.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        success: false,
        message: "Partner join service is not ready. Please run database migration 005_partner_join_leads.sql.",
      });
    }
    return res.status(500).json({ success: false, message: "Could not complete registration request" });
  }
};

export const getPartnerJoinLead = async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, message: "Token is required" });
    }

    const lead = await getPartnerJoinLeadByToken(token);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    if (lead.error === "already_registered") {
      return res.status(409).json({
        success: false,
        message: "This application is already completed. Please login in the app.",
      });
    }

    return res.status(200).json({ success: true, ...lead });
  } catch (err) {
    console.error("[getPartnerJoinLead]", err);
    return res.status(500).json({ success: false, message: "Could not fetch lead" });
  }
};
