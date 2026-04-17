// cronJobs.js
import db from "#db";
import cron from "node-cron";
import dayjs from "dayjs";
import fetch from "node-fetch"; // For Node <18; on Node 18+ global fetch works
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import fs from "fs";
import admin from "firebase-admin";
import dotenv from "dotenv";
import Papa from "papaparse";
import axios from "axios";
import { google } from "googleapis";

dotenv.config();

dayjs.extend(utc);
dayjs.extend(timezone);

// Territory Partner Firebase app

const territoryPartnerServiceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_TERRITORY,
);
const tpApp = admin.initializeApp(
  {
    credential: admin.credential.cert({
      ...territoryPartnerServiceAccount,
      private_key: territoryPartnerServiceAccount.private_key.replace(
        /\\n/g,
        "\n",
      ),
    }),
  },
  "territoryPartnerApp",
);

const salespersonServiceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_SALES,
);
const spApp = admin.initializeApp(
  {
    credential: admin.credential.cert({
      ...salespersonServiceAccount,
      private_key: salespersonServiceAccount.private_key.replace(/\\n/g, "\n"),
    }),
  },
  "salespersonApp",
);

//PROJECT
const projectpartnerServiceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT,
);
const projectApp = admin.initializeApp(
  {
    credential: admin.credential.cert({
      ...projectpartnerServiceAccount,
      private_key: projectpartnerServiceAccount.private_key.replace(
        /\\n/g,
        "\n",
      ),
    }),
  },
  "projectpartner",
);

async function sendTPNotification(token, title, body) {
  if (!token) return; // safety check
  const message = {
    token,
    notification: { title, body },
    android: { priority: "high" },
    apns: { headers: { "apns-priority": "10" } },
  };

  try {
    const response = await tpApp.messaging().send(message);
    console.log(" Territory Partner notification sent:", response);
  } catch (err) {
    console.error(" Error sending TP notification:", err);
  }
}

// Send notification to Salesperson
async function sendSPNotification(token, title, body) {
  if (!token) return; // safety check
  const message = {
    token,
    notification: { title, body },
    android: { priority: "high" },
    apns: { headers: { "apns-priority": "10" } },
  };

  try {
    const response = await spApp.messaging().send(message);
    console.log(" Salesperson notification sent:", response);
  } catch (err) {
    console.error(" Error sending SP notification:", err);
  }
}

// Send notification to Salesperson
async function sendPPNotification(
  token,
  title,
  body,
  screenName = "EnquiriesScreen",
) {
  if (!token) return;

  const message = {
    token: token,

    // 👇 MUST include title + body for Android to show banner
    notification: {
      title: title,
      body: body,
    },

    // 👇 Data payload — strings only!
    data: {
      screen: screenName || "EnquiriesScreen",
      //  click_action: "FLUTTER_NOTIFICATION_CLICK",
    },

    android: {
      priority: "high",
      notification: {
        sound: "notify",
        channelId: "default", //  must match notifee channel
        // clickAction: "DEFAULT", //  IMPORTANT
      },
    },

    apns: {
      headers: { "apns-priority": "10" },
      payload: {
        aps: {
          sound: "notify",
          category: "NEW_MESSAGE",
        },
      },
    },
  };

  try {
    const response = await projectApp.messaging().send(message);
    console.log("📨 Project Partner Notification Sent:", response);
  } catch (err) {
    console.error(" Error Sending PP Notification:", err);
  }
}

function formatTime(timeString) {
  if (!timeString) return "--:--";

  const [h, m] = timeString.split(":");
  let hour = parseInt(h);
  const minute = m;

  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;

  return `${hour}:${minute} ${ampm}`;
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const cleanInactiveUntil = async () => {
  console.log("Running cron job to clean inactive_until...");

  try {
    const [rows] = await db.query(`
      SELECT id, inactive_until
      FROM territorypartner
      WHERE inactive_until IS NOT NULL
    `);

    const today = dayjs().format("YYYY-MM-DD");

    for (const row of rows) {
      let dates;
      try {
        dates = JSON.parse(row.inactive_until);
      } catch (err) {
        console.error(`Invalid JSON for partner ${row.id}`, err);
        continue;
      }
      if (!Array.isArray(dates)) continue;

      const futureDates = dates.filter((d) => d >= today);
      if (futureDates.length !== dates.length) {
        await db.query(
          `UPDATE territorypartner
             SET inactive_until = ?
           WHERE id = ?`,
          [futureDates.length ? JSON.stringify(futureDates) : null, row.id],
        );
        console.log(`Cleaned past dates for partner ${row.id}`);
      }
    }
    console.log(" inactive_until cleanup done");
  } catch (err) {
    console.error(" Error running inactive_until cron job:", err);
  }
};

export const checkEnquiriesWithTime = () => {
  const selectSql = `
    SELECT teid
    FROM territoryenquiry
    WHERE status = 'New'
      AND created_at <= NOW() - INTERVAL 10 MINUTE
  `;

  db.query(selectSql, (err, results) => {
    if (err) {
      console.error(" Database Query Error:", err);
      return;
    }
    if (!results.length) {
      console.log("No enquiries to reject.");
      return;
    }

    const idsToUpdate = results.map((row) => row.teid);
    const updateSql = `
      UPDATE territoryenquiry
         SET status = 'Rejected'
       WHERE teid IN (?)
    `;

    db.query(updateSql, [idsToUpdate], (updateErr, updateResult) => {
      if (updateErr) {
        console.error(" Error updating enquiries:", updateErr);
        return;
      }
      console.log(` Rejected ${updateResult.affectedRows} enquiries.`);
    });
  });
};

cron.schedule("0 0 * * *", cleanInactiveUntil);
// 🕐 Run every minute to reject old enquiries
cron.schedule("* * * * *", checkEnquiriesWithTime);
// 🕣 NEW: Run every day at 8:30 AM to alert territory partners for 9–10 slot
const allTimeSlots = [
  "8 - 9AM",
  "9 - 10AM",
  "10 - 11AM",
  "11 - 12PM",
  "12 - 1PM",
  "1 - 2PM",
  "2 - 3PM",
  "3 - 4PM",
  "4 - 5PM",
  "5 - 6PM", // fixed typo 5-6AM → 5-6PM
];

const slotStartAMPM = {
  8: "AM",
  9: "AM",
  10: "AM",
  11: "AM",
  12: "PM",
  1: "PM",
  2: "PM",
  3: "PM",
  4: "PM",
  5: "PM",
};

async function notifySlot(timeSlot) {
  const today = dayjs().tz("Asia/Kolkata").format("D-M-YYYY");
  console.log(`\n🔔 Running notifySlot for "${timeSlot}" on ${today}`);

  const sql = `
  SELECT 
    e.enquirersid,
    e.customer,  
    e.contact,  
    e.location,       
    e.city,          
    tp.onesignalid
  FROM enquirers e
  JOIN territorypartner tp ON tp.id = e.territorypartnerid
  WHERE e.visitdate = ?
    AND e.territorytimeslot = ?
`;

  db.query(sql, [today, timeSlot], async (err, results) => {
    if (err) {
      console.error(` Database Query Error in notifySlot(${timeSlot}):`, err);
      return;
    }

    if (!results.length) {
      console.log(`No enquiries for slot ${timeSlot} on ${today}`);
      return;
    }

    console.log(`📌 Found ${results.length} enquiries for slot ${timeSlot}`);

    for (const row of results) {
      if (!row.onesignalid) {
        console.warn(`⚠️ No FCM token for enquiry ${row.enquirersid}`);
        continue;
      }

      await sendTPNotification(
        row.onesignalid,
        "🔔 Visit Reminder",
        `Hello Territory Partner 👋,

You have a scheduled visit today! 

🗓 Date: ${today}
⏰ Time Slot: ${timeSlot}
👤 Customer: ${row.customer} 
📞 Contact: ${row.contact}
📍 Location: ${row.location}, ${row.city}

Please make sure to follow up on time and provide the best service.

 Reminder: Be punctual and prepared for the visit!

Thank you,
Team Reparv`,
      );
    }
  });
}

const notifiedSlotsToday = new Set();

// Reset the set at midnight
cron.schedule("0 0 * * *", () => {
  notifiedSlotsToday.clear();
  console.log("🗓 Reset notified slots for the new day");
});
// Notification cron: runs every minute
cron.schedule("* * * * *", () => {
  const now = dayjs().tz("Asia/Kolkata");
  const currentHour = now.hour();
  const currentMinute = now.minute();
  const today = now.format("D-M-YYYY");

  allTimeSlots.forEach((slot) => {
    const [startStr] = slot.split(" - ");
    let hour = parseInt(startStr);
    const ampm = slotStartAMPM[startStr];

    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;

    // Notification time = 30 min before slot
    const notifyTime = dayjs()
      .hour(hour)
      .minute(0)
      .second(0)
      .subtract(30, "minute");
    const notifyHour = notifyTime.hour();
    const notifyMinute = notifyTime.minute();

    const slotKey = `${today}-${slot}`; // unique key for slot today

    // Only notify if current time matches AND we haven't notified yet
    if (
      currentHour === notifyHour &&
      currentMinute === notifyMinute &&
      !notifiedSlotsToday.has(slotKey)
    ) {
      console.log(
        `🔔 Sending notification for slot "${slot}" at ${now.format("HH:mm")}`,
      );
      notifySlot(slot);
      notifiedSlotsToday.add(slotKey); // mark as notified
    }
  });
});

export const checkNewEnquiries = async () => {
  const query = `
    SELECT e.*, t.onesignalid
    FROM enquirers e
    INNER JOIN territorypartner t
      ON e.territorypartnerid = t.id
    WHERE e.territorypartnerid IS NOT NULL
      AND e.salespersonid IS NOT NULL
      AND e.territorystatus = 'New'
      AND (e.tp_notified IS NULL OR e.tp_notified = 0)
  `;

  db.query(query, async (err, results) => {
    if (err) {
      console.error(" Database query error:", err);
      return;
    }

    if (results.length === 0) {
      console.log("No new enquiries for territory partners.");
      return;
    }

    for (const enquiry of results) {
      console.log(
        `Sending notification to OneSignal ID: ${enquiry.onesignalid} for enquiry ID: ${enquiry.enquirersid}`,
      );

      await sendTPNotification(
        enquiry.onesignalid,
        "🔔 New Enquiry Assigned",
        `Hello Territory Partner 👋,

You have been assigned a new enquiry!  

👤 Customer: ${enquiry.customer} 
📞 Contact: ${enquiry.contact}
📍 Location: ${enquiry.location}, ${enquiry.city}

Please take action on this enquiry: Accept  or Reject . 

Ensure timely follow-up and provide the best service.

Thank you,
Team Reparv`,
      );

      //  Mark as notified
      const updateQuery = `UPDATE enquirers SET tp_notified = 1 WHERE enquirersid = ?`;
      db.query(updateQuery, [enquiry.enquirersid], (err) => {
        if (err) {
          console.error(
            ` Failed to update enquiry ${enquiry.enquirersid}:`,
            err,
          );
        } else {
          console.log(` Enquiry ${enquiry.enquirersid} marked as notified.`);
        }
      });
    }
  });
};

export const sendVisitReminders = async () => {
  const visitDate = new Date().toISOString().split("T")[0];
  const sql = `
    SELECT pf.*, 
           e.territorypartnerid, 
           e.salespersonid, 
           tp.onesignalid AS territoryOneSignalId, 
           sp.onesignalid AS salesOneSignalId,
           e.customer, e.contact, e.location, e.city
    FROM propertyfollowup pf
    JOIN enquirers e ON pf.enquirerid = e.enquirersid
    LEFT JOIN territorypartner tp ON e.territorypartnerid = tp.id
    LEFT JOIN salespersons sp ON e.salespersonid = sp.salespersonsid
    WHERE pf.visitdate = ?
      AND pf.status IN ('Follow Up', 'Visit Scheduled')
      AND (pf.notification_sent IS NULL OR pf.notification_sent = 0)
  `;

  db.query(sql, [visitDate], async (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return;
    }

    for (const row of results) {
      // Notify Salesperson
      if (row.salesOneSignalId) {
        await sendSPNotification(
          row.salesOneSignalId,
          "🔔 Visit Reminder",
          `Hello Sales Partner 👋,

You have a scheduled visit today!  

👤 Customer: ${row.customer} 
📞 Contact: ${row.contact}
📍 Location: ${row.location}, ${row.city}

Please make sure to follow up on time and provide the best service.

Thank you,
Team Reparv




`,
        );
      }
      // Notify Territory Partner
      if (row.territoryOneSignalId) {
        await sendTPNotification(
          row.territoryOneSignalId,
          "🔔 Visit  Reminder",
          `Hello Territory Partner 👋,

You have a scheduled visit today!  

👤 Customer: ${row.customer} 
📞 Contact: ${row.contact}
📍 Location: ${row.location}, ${row.city}

Please make sure to follow up on time and provide the best service.

Thank you,
Team Reparv   


`,
        );
      }

      // Mark follow-up as notified
      db.query(
        "UPDATE propertyfollowup SET notification_sent = 1 WHERE followupid = ?",
        [row.followupid],
        (err) => {
          if (err) console.error(" Failed to mark notification_sent:", err);
        },
      );
    }
  });
};

// Cron: run every minute, but notifications will only send once per follow-up
cron.schedule("* * * * *", sendVisitReminders);
cron.schedule("* * * * *", checkNewEnquiries);
// Runs every day at midnight

// Helper function to use callback-style db.query with async/await

const queryAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("🕛 Running daily subscription status & reminder check...");

    // 1️⃣ Expire old subscriptions
    await queryAsync(`
      UPDATE subscriptions
      SET status = 'Expired'
      WHERE end_date < NOW()
      AND status = 'Active'
    `);

    // 2️⃣ Find subscriptions expiring in exactly 7 days and not yet notified
    const expiringSoon = await queryAsync(`
      SELECT
        s.id,
        s.salespersonid,
        s.plan,
        s.end_date,
        sp.onesignalid,
        sp.fullname
      FROM subscriptions s
      JOIN salespersons sp
        ON s.salespersonid = sp.salespersonsid
      WHERE DATE(s.end_date) = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        AND s.status = 'Active'
        AND s.notified_7days = 0
    `);

    // 3️⃣ Send notifications
    for (const sub of expiringSoon) {
      if (sub.onesignalid) {
        await sendSPNotification(
          sub.onesignalid,
          "⚠️ Subscription Expiry Reminder",
          `Hello ${sub.fullname}, 👋

We wanted to remind you that your Reparv Sales Partner subscription will expire in *7 days*.

🗓️ Expiry Date: ${new Date(sub.end_date).toLocaleDateString()}
💼 Current Plan: ${sub.plan}

Please renew your subscription before it expires to continue:
- Receiving new leads and enquiries 📈
- Accessing premium tools and analytics 📊
- Maintaining your active Sales Partner status

Renew now to avoid any interruption in your services.

Thank you,
Team Reparv`,
        );

        // 4️⃣ Mark as notified
        await queryAsync(
          `UPDATE subscriptions SET notified_7days = 1 WHERE id = ?`,
          [sub.id],
        );

        console.log(`✅ Sent 7-day expiry reminder to ${sub.fullname}`);
      }
    }

    console.log("✅ Expiry check and reminders completed successfully.");
  } catch (error) {
    console.error("❌ Error in subscription cron:", error);
  }
});

export const checkcalendernotes = () => {
  const sql = `
    SELECT c.id, c.note, c.date, c.time,
           c.projectPartnerId, pp.onesignalid AS project_onesignal,
           c.salesPartnerId, sp.onesignalid AS sales_onesignal,
           c.territoryPartnerId, tp.onesignalid AS territory_onesignal
    FROM calendernotes c 
    LEFT JOIN projectpartner pp ON pp.id = c.projectPartnerId
    LEFT JOIN salespersons sp ON sp.salespersonsid = c.salesPartnerId
    LEFT JOIN territorypartner tp ON tp.id = c.territoryPartnerId
    WHERE c.notified = 0
      AND c.date = CURDATE()
      AND TIMESTAMP(c.date, c.time) <= NOW() + INTERVAL 10 MINUTE
      AND TIMESTAMP(c.date, c.time) > NOW()
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Calendar Notes Check Error:", err);
      return;
    }

    if (!results.length) {
      console.log("No upcoming notes within next 10 minutes.");
      return;
    }

    console.log("Notes to notify:", results);

    (async () => {
      for (const row of results) {
      const title = "⏰ Upcoming Reminder";
      const msg = `You have a scheduled note at ${formatTime(
        row.time,
      )} on ${formatDate(row.date)}.
Note: ${row.note}`;

      // ---- SEND NOTIFICATION TO PROJECT PARTNER ----
      if (row.project_onesignal) {
        try {
          await sendPPNotification(
            row.project_onesignal,
            title,
            msg,
            "Calender",
          );
          console.log("PP notified:", row.project_onesignal);
        } catch (e) {
          console.error("PP notification error:", e);
        }
      }

      // ---- SEND NOTIFICATION TO SALES PARTNER ----
      if (row.sales_onesignal) {
        try {
          await sendSPNotification(row.sales_onesignal, title, msg, "Calender");
          console.log("Sales notified:", row.sales_onesignal);
        } catch (e) {
          console.error("Sales notification error:", e);
        }
      }

      // ---- SEND NOTIFICATION TO TERRITORY PARTNER ----
      if (row.territory_onesignal) {
        try {
          await sendTPNotification(
            row.territory_onesignal,
            title,
            msg,
            "Calender",
          );
          console.log("Territory notified:", row.territory_onesignal);
        } catch (e) {
          console.error("Territory notification error:", e);
        }
      }

      await new Promise((resolve, reject) => {
        db.query(
          "UPDATE calendernotes SET notified = 1 WHERE id = ?",
          [row.id],
          (updateErr) => {
            if (updateErr) {
              console.error("Update notify flag error:", updateErr);
              reject(updateErr);
            } else {
              resolve();
            }
          },
        );
      });
      }
    })().catch((e) => console.error("Calendar notes notify loop:", e));
  });
};

cron.schedule("* * * * *", checkcalendernotes);

function notifyProjectPartnerForNewEnquiry() {
  try {
    // 1) Get all enquiries where pp_notified = 0
    db.query(
      `
      SELECT 
        e.enquirersid,
        e.propertyid,
        p.projectpartnerid,
        p.propertyName,
        p.location,
        pp.onesignalid AS token
      FROM enquirers e
      INNER JOIN properties p ON e.propertyid = p.propertyid
      INNER JOIN projectpartner pp ON p.projectpartnerid = pp.id
      WHERE e.pp_notified = 0
    `,
      async (err, rows) => {
        if (err) {
          console.log("DB Error while fetching enquiries:", err);
          return;
        }

        if (!rows || rows.length === 0) {
          console.log("No new enquiries found.");
          return;
        }

        // 2) Loop enquiries and notify
        for (let enquiry of rows) {
          const { token, propertyName, location, enquirersid } = enquiry;

          if (!token) {
            console.log(" Project partner token missing.");
            continue;
          }

          const title = "📩 New Enquiry Received";
          const message = `You have a new enquiry for:
🏡 Property: ${propertyName}
📍 Location: ${location}`;

          try {
            await sendPPNotification(token, title, message, "EnquiriesScreen");
            console.log("Notification sent to:", token);
          } catch (notifyErr) {
            console.log("Error sending push notification:", notifyErr);
            continue;
          }

          // 3) Update pp_notified = 1
          db.query(
            `UPDATE enquirers SET pp_notified = 1 WHERE enquirersid = ?`,
            [enquirersid],
            (updateErr) => {
              if (updateErr) {
                console.log(
                  "Error updating pp_notified for enquiry:",
                  enquirersid,
                  updateErr,
                );
              } else {
                console.log(`pp_notified updated for enquiry ${enquirersid}`);
              }
            },
          );
        }
      },
    );
  } catch (error) {
    console.log("Error sending new enquiry notifications:", error);
  }
}

cron.schedule("* * * * *", notifyProjectPartnerForNewEnquiry);

function convertSheetUrlToCsv(sheetUrl) {
  if (!sheetUrl) return null;

  try {
    const url = new URL(sheetUrl);

    // Extract spreadsheet ID
    const match = url.pathname.match(/\/d\/([^/]+)/);
    if (!match) throw new Error("Invalid Google Sheet URL");

    const sheetId = match[1];

    // Extract gid (sheet tab)
    const gid =
      url.searchParams.get("gid") || url.hash.replace("#gid=", "") || 0;

    // Build CSV export URL
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  } catch (err) {
    console.error("Sheet URL conversion error:", err.message);
    return null;
  }
}

const getAllPropertySheets = () => {
  return new Promise((resolve, reject) => {
    db.query(
      `SELECT propertyid, adUrl FROM properties WHERE adUrl IS NOT NULL`,
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
  });
};

const auth = new google.auth.GoogleAuth({
  credentials: {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

function extractSheetId(sheetUrl) {
  if (!sheetUrl) return null;

  try {
    const match = sheetUrl.match(/\/d\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const sheets = google.sheets({ version: "v4", auth });

async function getSheetRows(spreadsheetId, range = "Sheet1") {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return res.data.values || [];
}

async function syncAllPropertySheets() {
  try {
    console.log("Global sheet sync started");

    const properties = await getAllPropertySheets();
    console.log(`Total properties: ${properties.length}`);

    for (const property of properties) {
      if (!property.adUrl) continue;

      const sheetId = extractSheetId(property.adUrl);
      if (!sheetId) {
        console.log(`Invalid sheet URL for property ${property.propertyid}`);
        continue;
      }

      try {
        console.log(`Fetching sheet for property ${property.propertyid}`);

        const rows = await getSheetRows(sheetId);

        if (!rows || rows.length < 2) {
          console.log(`No data rows for property ${property.propertyid}`);
          continue;
        }

        console.log(
          `Property ${property.propertyid} contains ${rows.length - 1} rows`,
        );

        await axios.post(process.env.API_URL, {
          propertyId: property.propertyid,
          rows,
        });

        console.log(`Property ${property.propertyid} synced successfully`);
      } catch (err) {
        console.error(
          `Sheet processing error for property ${property.propertyid}:`,
          err.message,
        );
      }
    }

    console.log("All property sheets synced successfully");
  } catch (err) {
    console.error("Global sync failed:", err.message);
  }
}

// Runs every 2 hours (at minute 0)
// cron.schedule("0 */2 * * *", async () => {
//   console.log(" Cron started: syncing all property sheets");

//   try {
//     await syncAllPropertySheets();
//     console.log(" Cron completed successfully");
//   } catch (err) {
//     console.error(" Cron failed:", err.message);
//   }
// });

// THIS IS FOR CUSTOMER REPARV APP
// ─────────────────────────────────────────────────────────────
// NEW CRON: Notify guestUsers when a new property is added
// Runs every 5 minutes
// Uses fcmToken column from guestUsers table
// Uses notified column from properties table (add if not exists)
// ─────────────────────────────────────────────────────────────

// Firebase app for guest users
const guestServiceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_GUEST;
let guestApp = null;
if (!guestServiceAccountRaw) {
  console.warn(
    "[GuestCron] FIREBASE_SERVICE_ACCOUNT_GUEST is missing. Guest push notifications are disabled.",
  );
} else {
  try {
    const guestServiceAccount = JSON.parse(guestServiceAccountRaw);
    guestApp = admin.initializeApp(
      {
        credential: admin.credential.cert({
          ...guestServiceAccount,
          private_key: guestServiceAccount.private_key.replace(/\\n/g, "\n"),
        }),
      },
      "guestApp",
    );
  } catch (err) {
    console.error(
      "[GuestCron] Invalid FIREBASE_SERVICE_ACCOUNT_GUEST JSON. Guest push notifications are disabled.",
      err.message,
    );
  }
}
const getImageUrl = (path) => {
  if (!path) return null;

  // Already a full URL (S3, Google, etc.)
  if (path.startsWith("http")) {
    return path;
  }

  // Local server image
  return `https://api.reparv.in/${path}`;
};
const parseFrontView = (frontView) => {
  try {
    return JSON.parse(frontView || "[]");
  } catch {
    return [];
  }
};
// Send FCM notification to a single guest user token
async function sendGuestNotification(guest, title, body, data = {}) {
  if (!guestApp) return;
  if (!guest?.fcmToken) return;
  const image = data.image;

  // const imageUrl = encodeURI(
  //   "https://reparv-assets.s3.ap-south-1.amazonaws.com/uploads/1772799052752-WhatsApp Image 2026-03-06 at 5.10.53 PM.webp",
  // );
  const imageUrl = encodeURI(image);
  console.log(imageUrl, data);

  const message = {
    token: guest.fcmToken,

    notification: {
      title,
      body,
      image: imageUrl,
    },

    data: {
      screen: "PropertyDetails",
      propertyid: String(data.propertyid || ""),
      propertyName: String(data.propertyName || ""),
      city: String(data.city || ""),
      image: imageUrl,
    },

    android: {
      priority: "high",
      notification: {
        imageUrl: imageUrl,
      },
    },

    apns: {
      headers: { "apns-priority": "5" },
      payload: { aps: { "content-available": 1 } },
      fcm_options: {
        image: imageUrl,
      },
    },
  };
  try {
    const response = await guestApp.messaging().send(message);
    console.log("📨 Guest notification sent:", response);
  } catch (err) {
    console.error("❌ Error sending guest notification:", err);
  }
}

async function notifyGuestsForNewProperties() {
  try {
    const [newProperties] = await db.promise().query(
      `SELECT propertyid, propertyName, location, city, seoSlug, frontView
     FROM properties
     WHERE notified = 0
       AND status = 'Active'
       AND approve = 'Approved'`,
    );

    if (newProperties.length === 0) {
      console.log("[GuestCron] No new properties to notify.");
      return;
    }

    console.log(`[GuestCron] Found ${newProperties.length} new property(ies).`);

    const [guestUsers] = await db.promise().query(
      `SELECT id, fullname, city, fcmToken
         FROM guestUsers
         WHERE fcmToken IS NOT NULL AND fcmToken != ''`,
    );

    if (guestUsers.length === 0) {
      console.log("[GuestCron] No guest users with FCM tokens.");
      const ids = newProperties.map((p) => p.propertyid);
      await db
        .promise()
        .query(`UPDATE properties SET notified = 1 WHERE propertyid IN (?)`, [
          ids,
        ]);
      return;
    }

    for (const property of newProperties) {
      const targetGuests = guestUsers.filter(
        (g) =>
          !g.city ||
          g.city.trim().toLowerCase() ===
            (property.city || "").trim().toLowerCase(),
      );

      if (targetGuests.length === 0) {
        console.log(
          `[GuestCron] No matching guests for property ${property.propertyid} in "${property.city}"`,
        );
      } else {
        console.log(
          `[GuestCron] Notifying ${targetGuests.length} guest(s) for property ${property.propertyid}`,
        );

        for (const guest of targetGuests) {
          console.log(property?.frontView[0]);

          await sendGuestNotification(
            guest,
            "🏡 New Property in " + property.city,
            `${property.propertyName} just listed in ${property.city}! Explore price, photos & details now.`,
            // ✅ deep-link data
            {
              screen: "PropertyDetails",
              propertyid: property.seoSlug,
              propertyName: property.propertyName,
              city: property.city,
              image: getImageUrl(parseFrontView(property?.frontView)[0]),
            },
          );
        }
      }

      await db
        .promise()
        .query(`UPDATE properties SET notified = 1 WHERE propertyid = ?`, [
          property.propertyid,
        ]);

      console.log(
        `[GuestCron] Property ${property.propertyid} marked as notified.`,
      );
    }
  } catch (err) {
    console.error("[GuestCron] Error:", err.message);
  }
}

// Runs every 5 minutes
cron.schedule("* * * * *", notifyGuestsForNewProperties);
// console.log("[GuestCron] New property → guest notification cron registered.");
