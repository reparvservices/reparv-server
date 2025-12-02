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

const sendEmail = async (email, username, password, role, url) => {
  try {
    const mailOptions = {
      from: `"Reparv" <${process.env.EMAIL_USER}>`,
      to: email.toLowerCase(),
      subject: `Your ${role} Account Details`,
      html: `
      <div style="font-family: Arial, sans-serif; background:#f5f5f7; padding:20px;">
        <div style="max-width:600px; margin:auto; background:white; border-radius:10px; padding:30px; box-shadow:0 3px 10px rgba(0,0,0,0.1);">

          <!-- Header -->
          <h2 style="text-align:center; color:#0bb500; margin-bottom:20px;">
            Reparv – Account Activation
          </h2>

          <p style="font-size:15px; color:#333;">Hello,</p>

          <p style="font-size:15px; color:#333;">
            You have been successfully assigned the role of 
            <strong style="color:#0bb500;">${role}</strong>.
          </p>

          <!-- Login Button -->
          <div style="text-align:center; margin:25px 0;">
            <a href="${url}" 
              style="
                background:#0bb500;
                color:white;
                padding:12px 22px;
                text-decoration:none;
                border-radius:6px;
                font-size:15px;
                display:inline-block;
              ">
              Login to Your Account
            </a>
          </div>

          <!-- Credentials Box -->
          <div style="
            background:#f0fdf4;
            border-left:4px solid #0bb500;
            padding:15px 18px;
            border-radius:6px;
            margin:20px 0;
          ">
            <p style="margin:0; font-size:15px; color:#333;"><strong>Username:</strong> ${username}</p>
            <p style="margin:0; font-size:15px; color:#333;"><strong>Password:</strong> ${password}</p>
          </div>

          <p style="font-size:14px; color:#555;">
            For security reasons, please log in and update your password immediately.
          </p>

          <!-- Footer -->
          <br>
          <p style="font-size:14px; color:#777; text-align:center;">
            Best regards,<br>
            <strong>Reparv Team</strong><br>
            <a href="https://www.reparv.in" style="color:#0bb500; text-decoration:none;">www.reparv.in</a>
          </p>

        </div>
      </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${email} (Message ID: ${info.messageId})`);
  } catch (error) {
    console.error("Error sending email:", error.message || error);
  }
};

export default sendEmail;