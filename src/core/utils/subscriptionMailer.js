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

const sendSubscriptionEmail = async (email, plan, planDuration, amount) => {
  try {
    const mailOptions = {
      from: `"Reparv" <${process.env.EMAIL_USER}>`,
      to: email.toLowerCase(),
      subject: `Subscription Purchased Successfully - ${plan}`,
      html: `
        <p>Hello,</p>
        <p>Thank you for choosing Reparv!</p>
        <p>Your <strong>${plan}</strong> subscription has been successfully activated.</p>
        <p><strong>Plan Duration:</strong> ${planDuration} month(s)</p>
        <p><strong>Amount Paid:</strong> ₹${amount}</p>
        <br>
        <p>You can now enjoy all the features included in this plan.</p>
        <p>If you have any questions or need support, feel free to contact us.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>Team Reparv</strong></p>
        <p><strong>www.reparv.in</strong></p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Subscription email sent to ${email} (Message ID: ${info.messageId})`);
  } catch (error) {
    console.error("Error sending subscription email:", error.message || error);
  }
};

export default sendSubscriptionEmail;