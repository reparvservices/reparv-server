import axios from "axios";

export async function sendOtpSMS(phone, otp) {
  const payload = new URLSearchParams({
    module: "TRANS_SMS",
    apikey: process.env.TWO_FACTOR_API_KEY,
    to: `91${phone}`, // India format
    from: "REPARV",
    msg: `Your OTP for Reparv app login is ${otp}. Valid for 5 minutes. Do not share with anyone.`,
  });

  const response = await axios.post(
    "https://2factor.in/API/R1/",
    payload.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  if (response.data.Status !== "Success") {
    throw new Error("SMS sending failed");
  }

  return response.data;
}