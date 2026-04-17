// controllers/accountCancellationController.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

export const accountCancellation = async (req, res) => {
  try {
    const { fullname, role, contact, email, username, password, reason } = req.body;

    if (!fullname || !role || !contact || !email || !username) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    // Create transporter (using your SMTP or Gmail service)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS, 
      },
    });

    // Email content
    const mailOptions = {
      from: `<${email}>`,
      to: process.env.EMAIL_USER_FOR_ACCOUNT_CANCELLATION,
      subject: "Account Cancellation Request",
      html: `
        <h2>Account Cancellation Request</h2>
        <p><strong>Name:</strong> ${fullname}</p>
        <p><strong>Role:</strong> ${role}</p>
        <p><strong>Contact:</strong> ${contact}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Password:</strong> ${password ? password : "Not Provided"}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <hr />
        <p>This request was sent from the account cancellation form.</p>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      message: "Account cancellation request sent successfully.",
    });
  } catch (error) {
    console.error("Account Cancellation Error:", error);
    return res.status(500).json({
      message: "Failed to send cancellation request. Please try again later.",
    });
  }
};