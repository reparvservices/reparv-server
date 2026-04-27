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

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatShortDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const buildBookingEmailHTML = ({
  name,
  eventTitle,
  eventDate,
  eventTime,
  venue,
  ticketCount,
  ticketPrice,
  amountPaid,
  bookingRef,
  bookingId,
  paymentId,
  paymentStatus,
  bookedAt,
  orgName = "Reparv Events",
  orgLogo = null,
}) => {
  const isFree = paymentStatus === "free" || amountPaid === 0;
  const baseTicketTotal = ticketPrice * ticketCount;
  const gst = isFree ? 0 : +(baseTicketTotal * 0.18).toFixed(2);
  const displayTotal = isFree ? "FREE" : `Rs ${amountPaid.toFixed(2)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Booking Confirmed - ${eventTitle}</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f5f5f7; margin:0; padding:20px;">
  <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e8e8ef;">
    <div style="background:linear-gradient(135deg,#2a0a6b,#5E23DC); color:#fff; padding:24px;">
      <h2 style="margin:0;">Booking Confirmed</h2>
      <p style="margin:8px 0 0; opacity:0.9;">${orgName}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin-top:0;">Hi <strong>${name}</strong>, your booking is confirmed.</p>
      <p><strong>Event:</strong> ${eventTitle}</p>
      <p><strong>Date:</strong> ${formatShortDate(eventDate)} | <strong>Time:</strong> ${eventTime}</p>
      <p><strong>Venue:</strong> ${venue}</p>
      <p><strong>Tickets:</strong> ${ticketCount}</p>
      <p><strong>Booking Ref:</strong> ${bookingRef}</p>
      <hr style="border:none;border-top:1px solid #eee;" />
      <p><strong>Ticket Amount:</strong> ${isFree ? "FREE" : `Rs ${baseTicketTotal.toFixed(2)}`}</p>
      ${!isFree ? `<p><strong>GST (18%):</strong> Rs ${gst.toFixed(2)}</p>` : ""}
      <p><strong>Total Paid:</strong> ${displayTotal}</p>
      <p><strong>Booking ID:</strong> #${bookingId}</p>
      ${paymentId ? `<p><strong>Payment ID:</strong> ${paymentId}</p>` : ""}
      <p><strong>Booked At:</strong> ${formatDate(bookedAt)}</p>
      ${
        orgLogo
          ? `<p style="margin-top:16px;"><img src="${orgLogo}" alt="${orgName}" style="height:40px;" /></p>`
          : ""
      }
    </div>
  </div>
</body>
</html>
  `.trim();
};

export const sendBookingConfirmationEmail = async (bookingData) => {
  const { email, eventTitle, bookingRef } = bookingData;
  const html = buildBookingEmailHTML(bookingData);

  const mailOptions = {
    from: `"${bookingData.orgName || "Reparv Events"}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Booking Confirmed - ${eventTitle} [${bookingRef}]`,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Booking email sent:", info.messageId);
    return true;
  } catch (err) {
    console.error("Email send failed:", err.message);
    return false;
  }
};
