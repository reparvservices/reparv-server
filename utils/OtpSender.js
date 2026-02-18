import axios from "axios";

export async function sendOtpSMS(phone, otp) {
  try {
    const payload = new URLSearchParams({
      module: "TRANS_SMS",
      apikey: process.env.OTP_KEY,
      to: phone.startsWith("91") ? phone : `91${phone}`,
      from: "REPARV",
      msg: `Your OTP for Reparv app ${otp}. Valid for 5 minutes. Do not share with anyone.`,
    });

    const response = await axios.post(
      "https://2factor.in/API/R1/",
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return {
      success: response?.data?.Status === "Success",
      providerResponse: response.data,
    };
  } catch (error) {
    console.error("SMS Error:", error?.response?.data || error.message);

    return {
      success: false,
      error: error?.response?.data || error.message,
    };
  }
}