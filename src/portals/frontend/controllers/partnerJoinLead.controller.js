import moment from "moment-timezone";
import bcrypt from "bcryptjs";
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
  validateJoinCredentials,
  partnerEmailAlreadyRegistered,
  createPartnerAccountFromJoin,
} from "../services/partnerJoinLead.service.js";

export const sendPartnerJoinLeadOtp = async (req, res) => {
  try {
    const contact = normalizeContact(req.body?.phone);
    if (!contact) {
      return res.status(400).json({ success: false, message: "Invalid phone number" });
    }

    const joinEmail = String(req.body?.email || "").trim().toLowerCase();
    if (joinEmail && (await partnerEmailAlreadyRegistered(joinEmail))) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered. Please log in or use another email.",
      });
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
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "First name and last name are required" });
    }
    const credentialError = validateJoinCredentials(email, password);
    if (credentialError) {
      return res.status(400).json({ success: false, message: credentialError });
    }
    if (!contact) {
      return res.status(400).json({ success: false, message: "Invalid phone number" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (await partnerContactAlreadyRegistered(contact)) {
      return res.status(409).json({
        success: false,
        message: "This number is already registered as a Reparv Partner. Please log in.",
      });
    }
    if (await partnerEmailAlreadyRegistered(email)) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered. Please log in or use another email.",
      });
    }

    const otpCheck = verifyOtpFromStore(contact, otp);
    if (!otpCheck.ok) {
      return res.status(401).json({ success: false, message: otpCheck.message });
    }

    const now = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    await upsertPartnerJoinLead({ firstName, lastName, contact, now });
    const passwordHash = await bcrypt.hash(password, 10);
    await createPartnerAccountFromJoin({
      firstName,
      lastName,
      contact,
      email,
      passwordHash,
      now,
    });

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
      accountCreated: true,
      message: "Your partner account is ready. Log in with your email and password.",
      whatsappSent,
      whatsappWarning,
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
