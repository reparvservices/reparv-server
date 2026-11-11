import axios from "axios";

const SEND_URL = "http://wapi.kinextechnologies.in/wapp/api/send";

/**
 * Sends a plain WhatsApp text through the Kinex wapi gateway (used for
 * "new enquiry assigned" alerts). The key comes from KINEX_WAPI_KEY in .env;
 * it must never be written in code.
 *
 * Never throws: alerts must not block the action that triggered them.
 * @returns {Promise<object|null>} gateway response, or null when skipped/failed
 */
export async function sendKinexWhatsapp(mobile, message) {
  const apikey = process.env.KINEX_WAPI_KEY;
  if (!apikey) {
    console.warn("KINEX_WAPI_KEY is not set — WhatsApp alert skipped.");
    return null;
  }
  if (!mobile) {
    console.warn("WhatsApp alert skipped: no mobile number.");
    return null;
  }

  try {
    const response = await axios.get(SEND_URL, {
      params: { apikey, mobile, msg: message },
      timeout: 10000,
    });
    console.log("WhatsApp API response:", response.data);
    return response.data;
  } catch (error) {
    console.error("WhatsApp send error:", error.message);
    return null;
  }
}
