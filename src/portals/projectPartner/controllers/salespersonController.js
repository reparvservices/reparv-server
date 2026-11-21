import db from "#db";
import moment from "moment-timezone";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";

export const getAll = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  // Each partner with how many enquiries are assigned to them and how many became deals (Token)
  const sql = `
      SELECT salespersons.*,
        (SELECT COUNT(*) FROM enquirers e WHERE e.salespersonid = salespersons.salespersonsid) AS enquiryCount,
        (SELECT COUNT(*) FROM enquirers e WHERE e.salespersonid = salespersons.salespersonsid AND e.status = 'Token') AS dealCount
      FROM salespersons
      WHERE salespersons.projectpartnerid = ?
      ORDER BY salespersons.created_at DESC;
    `;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map(({ password, ...row }) => ({
      ...row, // never send the password hash to the browser
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch All Active**
export const getAllActive = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const sql =
    "SELECT * FROM salespersons WHERE status = 'Active' AND salespersons.projectpartnerid = ? ORDER BY salespersonsid DESC";
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// ---------------- ADD SALES PERSON ----------------
// (manage handlers setStatus / setCredentials / remove are at the end of this file)
export const add = async (req, res) => {
  try {
    const userId = req.projectPartnerUser?.id;
    if (!userId)
      return res.status(401).json({
        message: "Unauthorized Access, Please Login Again!",
      });

    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const {
      fullname,
      contact,
      email,
      intrest,
      refrence,
      address,
      state,
      city,
      pincode,
      experience,
      rerano,
      adharno,
      panno,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
      username,
      password,
    } = req.body;

    if (!fullname || !contact || !email || !intrest)
      return res.status(400).json({
        message: "FullName, Contact and Email Required!",
      });

    // Login credentials for the sales partner (the sales partner signs in with these)
    const loginUsername = String(username || "").trim();
    if (!loginUsername || !password)
      return res.status(400).json({
        message: "Username and password are required for the sales partner login.",
      });
    if (String(password).length < 8)
      return res.status(400).json({
        message: "Password must be at least 8 characters.",
      });

    // Generate unique referral code
    const createReferralCode = () => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return "REF-" + code;
    };

    const generateUniqueReferralCode = (callback) => {
      const code = createReferralCode();
      db.query(
        "SELECT referral FROM salespersons WHERE referral = ?",
        [code],
        (err, results) => {
          if (err) return callback(err, null);
          if (results.length > 0) return generateUniqueReferralCode(callback);
          return callback(null, code);
        },
      );
    };

    // Upload files to S3 in parallel
    const [adharImageUrl, panImageUrl, reraImageUrl] = await Promise.all([
      uploadToS3(req.files?.["adharImage"]?.[0]),
      uploadToS3(req.files?.["panImage"]?.[0]),
      uploadToS3(req.files?.["reraImage"]?.[0]),
    ]);

    const hashedPassword = await bcrypt.hash(String(password), 10);

    // Check duplicates
    db.query(
      "SELECT * FROM salespersons WHERE contact = ? OR email = ? OR username = ?",
      [contact, email, loginUsername],
      (checkErr, checkResult) => {
        if (checkErr)
          return res.status(500).json({
            message: "Database error during validation",
            error: checkErr,
          });

        if (checkResult.length > 0)
          return res.status(409).json({
            message:
              "Sales person already exists with this Contact or Email Id.",
          });

        generateUniqueReferralCode((referralErr, referralCode) => {
          if (referralErr)
            return res.status(500).json({
              message: "Error generating referral code",
              error: referralErr,
            });

          const insertSql = `
            INSERT INTO salespersons 
            (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, rerano, adharno, panno, 
             bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, username, password, loginstatus, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.query(
            insertSql,
            [
              userId,
              fullname,
              contact,
              email,
              intrest,
              refrence,
              referralCode,
              address,
              state,
              city,
              pincode,
              experience,
              rerano,
              adharno,
              panno,
              bankname,
              accountholdername,
              accountnumber,
              ifsc,
              adharImageUrl,
              panImageUrl,
              reraImageUrl,
              loginUsername,
              hashedPassword,
              "Active",
              currentdate,
              currentdate,
            ],
            (insertErr, insertResult) => {
              if (insertErr)
                return res.status(500).json({
                  message: "Database error",
                  error: insertErr,
                });

              // Insert default follow-up
              db.query(
                `INSERT INTO partnerFollowup 
                  (partnerId, role, followUp, followUpText, created_at, updated_at) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  insertResult.insertId,
                  "Sales Person",
                  "New",
                  "Newly Added Sales Person",
                  currentdate,
                  currentdate,
                ],
                (followupErr) => {
                  if (followupErr)
                    return res.status(500).json({
                      message: "Follow-up insert failed",
                      error: followupErr,
                    });

                  res.status(201).json({
                    message: "Sales Person added successfully",
                    Id: insertResult.insertId,
                  });
                },
              );
            },
          );
        });
      },
    );
  } catch (err) {
    console.error("Error adding sales person:", err);
    res.status(500).json({ message: "Internal Server Error", error: err });
  }
};

// ---------------- EDIT SALES PERSON ----------------
export const edit = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const {
      fullname,
      contact,
      email,
      intrest,
      address,
      state,
      city,
      pincode,
      experience,
      rerano,
      adharno,
      panno,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
    } = req.body;

    const salespersonsid = parseInt(req.params.id);
    if (isNaN(salespersonsid))
      return res.status(400).json({ message: "Invalid Partner ID" });

    if (!fullname || !contact || !email)
      return res.status(400).json({ message: "All fields are required" });

    // Upload new files if any
    const [adharImageUrl, panImageUrl, reraImageUrl] = await Promise.all([
      uploadToS3(req.files?.["adharImage"]?.[0]),
      uploadToS3(req.files?.["panImage"]?.[0]),
      uploadToS3(req.files?.["reraImage"]?.[0]),
    ]);

    // Get old images (only for this project partner's own sales partners)
    db.query(
      "SELECT adharimage, panimage, reraimage FROM salespersons WHERE salespersonsid = ? AND projectpartnerid = ?",
      [salespersonsid, req.projectPartnerUser?.id],
      async (selectErr, results) => {
        if (selectErr)
          return res.status(500).json({
            message: "Database error while fetching old images",
            error: selectErr,
          });
        if (!results.length) {
          return res.status(404).json({ message: "Sales partner not found" });
        }

        const oldData = results[0];

        // Delete old images if replaced
        if (adharImageUrl) await deleteFromS3(oldData?.adharimage);
        if (panImageUrl) await deleteFromS3(oldData?.panimage);
        if (reraImageUrl) await deleteFromS3(oldData?.reraimage);

        // Prepare update
        let updateSql = `UPDATE salespersons SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, 
          pincode = ?, experience = ?, rerano = ?, adharno = ?, panno = ?, bankname = ?, accountholdername = ?, accountnumber = ?, ifsc = ?, updated_at = ?`;
        const updateValues = [
          fullname,
          contact,
          email,
          intrest,
          address,
          state,
          city,
          pincode,
          experience,
          rerano,
          adharno,
          panno,
          bankname,
          accountholdername,
          accountnumber,
          ifsc,
          currentdate,
        ];

        if (adharImageUrl) {
          updateSql += `, adharimage = ?`;
          updateValues.push(adharImageUrl);
        }
        if (panImageUrl) {
          updateSql += `, panimage = ?`;
          updateValues.push(panImageUrl);
        }
        if (reraImageUrl) {
          updateSql += `, reraimage = ?`;
          updateValues.push(reraImageUrl);
        }

        updateSql += ` WHERE salespersonsid = ?`;
        updateValues.push(salespersonsid);

        db.query(updateSql, updateValues, (updateErr) => {
          if (updateErr)
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });

          res
            .status(200)
            .json({ message: "Sales person updated successfully" });
        });
      },
    );
  } catch (err) {
    console.error("Error updating sales person:", err);
    res.status(500).json({ message: "Internal Server Error", error: err });
  }
};

/** One of the signed-in project partner's own sales partners (no secrets). */
export const getById = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: "Invalid Partner ID" });

  db.query(
    "SELECT * FROM salespersons WHERE salespersonsid = ? AND projectpartnerid = ?",
    [id, userId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching sales partner:", err);
        return res.status(500).json({ message: "Database error" });
      }
      if (!rows.length) return res.status(404).json({ message: "Sales partner not found" });
      const { password: _pw, otp: _otp, ...partner } = rows[0];
      return res.json(partner);
    },
  );
};

/* ───────────── manage a sales partner (only the project partner who owns them) ───────────── */

const ownedPartner = async (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized Access, Please Login Again!" });
    return null;
  }
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ message: "Invalid Partner ID" });
    return null;
  }
  const [rows] = await db
    .promise()
    .query("SELECT salespersonsid, fullname, status, loginstatus FROM salespersons WHERE salespersonsid = ? AND projectpartnerid = ?", [id, userId]);
  if (!rows.length) {
    res.status(404).json({ message: "Sales partner not found" });
    return null;
  }
  return rows[0];
};

// Activate / deactivate. A deactivated partner can no longer sign in.
export const setStatus = async (req, res) => {
  try {
    const partner = await ownedPartner(req, res);
    if (!partner) return;
    const next = partner.status === "Active" ? "Inactive" : "Active";
    await db
      .promise()
      .query("UPDATE salespersons SET status = ?, loginstatus = ?, updated_at = ? WHERE salespersonsid = ?", [
        next,
        next,
        moment().format("YYYY-MM-DD HH:mm:ss"),
        partner.salespersonsid,
      ]);
    res.json({ message: `${partner.fullname} is now ${next.toLowerCase()}`, status: next });
  } catch (error) {
    console.error("setStatus error:", error);
    res.status(500).json({ message: "Could not change the status" });
  }
};

// Set a new username and/or password for the partner's sign-in
export const setCredentials = async (req, res) => {
  try {
    const partner = await ownedPartner(req, res);
    if (!partner) return;

    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!username && !password) {
      return res.status(400).json({ message: "Enter a username, a password, or both." });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const sets = [];
    const values = [];
    if (username) {
      const [taken] = await db
        .promise()
        .query("SELECT salespersonsid FROM salespersons WHERE username = ? AND salespersonsid <> ?", [username, partner.salespersonsid]);
      if (taken.length) return res.status(409).json({ message: "That username is already taken." });
      sets.push("username = ?");
      values.push(username);
    }
    if (password) {
      sets.push("password = ?");
      values.push(await bcrypt.hash(password, 10));
    }
    sets.push("updated_at = ?");
    values.push(moment().format("YYYY-MM-DD HH:mm:ss"), partner.salespersonsid);

    await db.promise().query(`UPDATE salespersons SET ${sets.join(", ")} WHERE salespersonsid = ?`, values);
    res.json({ message: "Sign-in details updated" });
  } catch (error) {
    console.error("setCredentials error:", error);
    res.status(500).json({ message: "Could not update the sign-in details" });
  }
};

// Delete only a partner with no enquiries assigned; otherwise deactivate instead.
export const remove = async (req, res) => {
  try {
    const partner = await ownedPartner(req, res);
    if (!partner) return;
    const [[{ n }]] = await db
      .promise()
      .query("SELECT COUNT(*) AS n FROM enquirers WHERE salespersonid = ?", [partner.salespersonsid]);
    if (n > 0) {
      return res.status(409).json({
        message: `${partner.fullname} has ${n} enquir${n === 1 ? "y" : "ies"} assigned. Deactivate them instead of deleting.`,
      });
    }
    await db.promise().query("DELETE FROM salespersons WHERE salespersonsid = ?", [partner.salespersonsid]);
    res.json({ message: "Sales partner deleted" });
  } catch (error) {
    console.error("remove sales partner error:", error);
    res.status(500).json({ message: "Could not delete the sales partner" });
  }
};
