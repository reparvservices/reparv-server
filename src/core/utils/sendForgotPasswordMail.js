import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send New Password On Email

const sendForgotPasswordMail = async (email, partner) => {
  try {
    if (!email) {
      console.error("Email is missing");
      return;
    }

    const mailOptions = {
      from: `"Reparv Team" <${process.env.EMAIL_USER}>`,
      to: email.toLowerCase(),
      subject: `Your Password Has Been Updated ✔`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f8f9fa;">
          <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

            <h2 style="color: #0bb500; text-align: center; margin-bottom: 10px;">
              Password Updated Successfully
            </h2>

            <p>Hello,</p>

            <p>Your account under the role of <strong>${partner.role}</strong> has been updated with a new Password.</p>

            <div style="background: #eef9f0; padding: 15px; border-left: 4px solid #0bb500; margin: 15px 0;">
              <h3 style="margin: 0 0 8px 0; color: #0bb500;">Account Details</h3>
              <p style="margin: 4px 0;"> <strong>Name:</strong> ${partner.fullname}</p>
              <p style="margin: 4px 0;"> <strong>Contact:</strong> ${partner.contact}</p>
              <p style="margin: 4px 0;"> <strong>Username:</strong> ${partner.username}</p>
              <p style="margin: 4px 0;"> <strong>Password:</strong> ${partner.password}</p>
            </div>

            <p>Please login and continue your work.</p>

            <br>
            <p style="font-size: 14px; color: #555;">Regards,<br><strong>Reparv Team</strong><br>www.reparv.in</p>

          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(
      `Email sent successfully to ${email} (Message ID: ${info.messageId})`
    );
  } catch (error) {
    console.error("Email Send Error:", error.message || error);
  }
};

export default sendForgotPasswordMail;
