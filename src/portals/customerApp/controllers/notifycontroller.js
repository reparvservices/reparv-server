import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/* ─────────────────────────────────────────
   EMAIL TEMPLATE
───────────────────────────────────────── */
const buildEmailTemplate = ({ contact, mobile, email }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Subscriber – Coming Soon</title>
</head>
<body style="margin:0;padding:0;background:#0D0B1E;font-family:'Segoe UI',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0D0B1E;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;border-radius:24px;overflow:hidden;
                      box-shadow:0 0 60px rgba(94,35,220,0.35);">

          <!-- ── HEADER BANNER ── -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A0A3C 0%,#5E23DC 60%,#321376 100%);
                        padding:48px 40px 36px;text-align:center;">
              <!-- Logo pill -->
              <div style="display:inline-block;background:rgba(255,255,255,0.12);
                           border:1px solid rgba(255,255,255,0.25);border-radius:999px;
                           padding:8px 22px;margin-bottom:24px;">
                <span style="color:#fff;font-size:13px;font-weight:700;letter-spacing:2px;">
                  ✦ REPARV SERVICES
                </span>
              </div>

              <h1 style="margin:0 0 10px;color:#FFFFFF;font-size:34px;font-weight:800;
                          letter-spacing:-0.5px;line-height:1.2;">
                New Subscriber Alert! 🚀
              </h1>
              <p style="margin:0;color:rgba(255,255,255,0.75);font-size:16px;line-height:1.5;">
                Someone just joined the waitlist for
                <strong style="color:#C8A8FF;">India's First Smart Rental Ecosystem</strong>
              </p>
            </td>
          </tr>

          <!-- ── SUBSCRIBER BADGE ── -->
          <tr>
            <td style="background:#120D2E;padding:0 40px;">
              <div style="background:linear-gradient(135deg,#1E1060,#2B1580);
                           border:1px solid rgba(94,35,220,0.4);border-radius:16px;
                           padding:28px 32px;margin:32px 0;text-align:center;">
                <div style="width:64px;height:64px;border-radius:50%;
                             background:linear-gradient(135deg,#5E23DC,#9B59F5);
                             display:inline-flex;align-items:center;justify-content:center;
                             margin-bottom:14px;font-size:26px;line-height:64px;">
                  👤
                </div>
                <h2 style="margin:0 0 6px;color:#FFFFFF;font-size:20px;font-weight:700;">
                  ${contact || "New User"}
                </h2>
                <p style="margin:0;color:#9B7FD4;font-size:13px;font-weight:600;
                            letter-spacing:1px;text-transform:uppercase;">
                  Waitlist Member
                </p>
              </div>
            </td>
          </tr>

          <!-- ── SUBSCRIBER DETAILS ── -->
          <tr>
            <td style="background:#120D2E;padding:0 40px 8px;">
              <h3 style="color:#C8A8FF;font-size:12px;font-weight:700;
                          letter-spacing:2px;text-transform:uppercase;
                          margin:0 0 16px;border-bottom:1px solid rgba(94,35,220,0.25);
                          padding-bottom:10px;">
                Contact Information
              </h3>

              <!-- Name row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td width="40" style="vertical-align:middle;">
                    <div style="width:36px;height:36px;border-radius:10px;
                                 background:rgba(94,35,220,0.2);
                                 border:1px solid rgba(94,35,220,0.35);
                                 text-align:center;line-height:36px;font-size:17px;">
                      👤
                    </div>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="color:rgba(255,255,255,0.45);font-size:11px;
                                  font-weight:600;letter-spacing:0.8px;
                                  text-transform:uppercase;display:block;">Full Name</span>
                    <span style="color:#FFFFFF;font-size:15px;font-weight:600;">
                      ${contact || "—"}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Mobile row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td width="40" style="vertical-align:middle;">
                    <div style="width:36px;height:36px;border-radius:10px;
                                 background:rgba(0,194,168,0.15);
                                 border:1px solid rgba(0,194,168,0.3);
                                 text-align:center;line-height:36px;font-size:17px;">
                      📱
                    </div>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="color:rgba(255,255,255,0.45);font-size:11px;
                                  font-weight:600;letter-spacing:0.8px;
                                  text-transform:uppercase;display:block;">Mobile</span>
                    <span style="color:#FFFFFF;font-size:15px;font-weight:600;">
                      ${mobile || "—"}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Email row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td width="40" style="vertical-align:middle;">
                    <div style="width:36px;height:36px;border-radius:10px;
                                 background:rgba(255,159,64,0.15);
                                 border:1px solid rgba(255,159,64,0.3);
                                 text-align:center;line-height:36px;font-size:17px;">
                      ✉️
                    </div>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="color:rgba(255,255,255,0.45);font-size:11px;
                                  font-weight:600;letter-spacing:0.8px;
                                  text-transform:uppercase;display:block;">Email Address</span>
                    <span style="color:#A78BFA;font-size:15px;font-weight:600;">
                      ${email}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── FEATURE PILLS ── -->
          <tr>
            <td style="background:#120D2E;padding:0 40px 32px;">
              <div style="background:rgba(94,35,220,0.08);border:1px solid rgba(94,35,220,0.2);
                           border-radius:14px;padding:20px 24px;">
                <p style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:700;
                            letter-spacing:1.5px;text-transform:uppercase;margin:0 0 14px;">
                  They're interested in
                </p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                  ${[
                    ["🔑", "Remote Access"],
                    ["⚡", "Energy Tracking"],
                    ["🛡️", "Smart Security"],
                    ["📅", "24/7 Visits"],
                    ["🚫", "No Brokers"],
                  ]
                    .map(
                      ([icon, label]) =>
                        `<span style="display:inline-block;background:rgba(94,35,220,0.25);
                                  border:1px solid rgba(94,35,220,0.4);border-radius:999px;
                                  padding:6px 14px;color:#C8A8FF;font-size:12px;
                                  font-weight:600;">
                       ${icon} ${label}
                     </span>`,
                    )
                    .join("")}
                </div>
              </div>
            </td>
          </tr>

          <!-- ── CTA BUTTON ── -->
          <tr>
            <td style="background:#120D2E;padding:0 40px 40px;text-align:center;">
              <a href="mailto:${email}"
                 style="display:inline-block;background:linear-gradient(135deg,#5E23DC,#9B59F5);
                         color:#fff;font-size:15px;font-weight:700;text-decoration:none;
                         border-radius:999px;padding:16px 40px;letter-spacing:0.3px;
                         box-shadow:0 8px 24px rgba(94,35,220,0.45);">
                Reply to Subscriber ✉️
              </a>
              <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:20px 0 0;">
                Received at: ${new Date().toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "full",
                  timeStyle: "short",
                })} IST
              </p>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="background:#0A0818;padding:24px 40px;text-align:center;
                        border-top:1px solid rgba(94,35,220,0.15);">
              <p style="color:rgba(255,255,255,0.2);font-size:12px;margin:0;">
                © ${new Date().getFullYear()} Reparv Services · All rights reserved
              </p>
              <p style="color:rgba(255,255,255,0.15);font-size:11px;margin:6px 0 0;">
                This is an automated notification from your PropSaathi / Reparv platform.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;

/* ─────────────────────────────────────────
   TRANSPORTER  (configure once at app start)
   Put credentials in .env — never hardcode
───────────────────────────────────────── */

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ─────────────────────────────────────────
   HELPER – validate email
───────────────────────────────────────── */
const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase().trim());

/* ─────────────────────────────────────────
   CONTROLLER
   POST /api/notify-subscriber
   body: { contact, mobile, email }
───────────────────────────────────────── */
export const notifySubscriber = async (req, res) => {
  try {
    const { contact, mobile, email } = req.body;
    console.log(req.body);
    /* ── Validation ── */
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (mobile && !/^\+?[0-9\s\-]{7,15}$/.test(mobile.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid mobile number.",
      });
    }

    /* ── Build & send mail ── */
    const mailOptions = {
      from: `"Reparv Notifications" <${process.env.MAIL_USER}>`,
      to: "reparvservices@gmail.com",
      subject: `🚀 New Subscriber: ${contact || email} joined the Coming Soon waitlist`,
      html: buildEmailTemplate({ contact, mobile, email }),
      replyTo: email, // clicking Reply in Gmail goes straight to the subscriber
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message:
        "Thank you! You have been added to the waitlist. We will notify you at launch.",
    });
  } catch (error) {
    console.error("[notifySubscriber] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};
