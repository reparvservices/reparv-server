import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

export const getAll = (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const sql = `
      SELECT territorypartner.*, pf.followUp, pf.created_at AS followUpDate
      FROM territorypartner
      LEFT JOIN (
        SELECT p1.*
        FROM partnerFollowup p1
        INNER JOIN (
          SELECT partnerId, MAX(created_at) AS latest
          FROM partnerFollowup
          WHERE role = 'Territory Partner'
          GROUP BY partnerId
        ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
        WHERE p1.role = 'Territory Partner'
      ) pf ON territorypartner.id = pf.partnerId
      WHERE territorypartner.projectpartnerid = ?
      ORDER BY territorypartner.created_at DESC;
    `;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching partners:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
      followUp: row.followUp || null,
      followUpDate: row.followUpDate
        ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json(formatted);
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const sql =
    "SELECT * FROM territorypartner WHERE status = 'Active' AND projectpartnerid = ? ORDER BY id DESC";
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// ---------------- ADD NEW TERRITORY PARTNER ----------------
export const add = async (req, res) => {
  try {
    const userId = req.projectPartnerUser.id;
    if (!userId)
      return res
        .status(401)
        .json({ message: "Unauthorized Access, Please Login Again!" });

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
      adharno,
      panno,
      rerano,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
    } = req.body;

    if (!fullname || !contact || !email || !intrest)
      return res.status(400).json({ message: "All Fields required!" });

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
        "SELECT referral FROM territorypartner WHERE referral = ?",
        [code],
        (err, results) => {
          if (err) return callback(err, null);
          if (results.length > 0) return generateUniqueReferralCode(callback);
          return callback(null, code);
        },
      );
    };

    // Upload files to S3
    const [adharImageUrl, panImageUrl, reraImageUrl] = await Promise.all([
      uploadToS3(req.files?.["adharImage"]?.[0]),
      uploadToS3(req.files?.["panImage"]?.[0]),
      uploadToS3(req.files?.["reraImage"]?.[0]),
    ]);

    // Check duplicates
    db.query(
      "SELECT * FROM territorypartner WHERE contact = ? OR email = ?",
      [contact, email],
      (checkErr, checkResult) => {
        if (checkErr)
          return res.status(500).json({
            message: "Database error during validation",
            error: checkErr,
          });
        if (checkResult.length > 0)
          return res.status(409).json({
            message:
              "Territory Partner already exists with this Contact or Email.",
          });

        // Generate referral code
        generateUniqueReferralCode((referralErr, referralCode) => {
          if (referralErr)
            return res.status(500).json({
              message: "Referral code generation failed",
              error: referralErr,
            });

          // Insert new partner
          const insertSql = `
          INSERT INTO territorypartner 
          (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, adharno, panno, rerano,
          bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, updated_at, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              adharno,
              panno,
              rerano,
              bankname,
              accountholdername,
              accountnumber,
              ifsc,
              adharImageUrl,
              panImageUrl,
              reraImageUrl,
              currentdate,
              currentdate,
            ],
            (insertErr, insertResult) => {
              if (insertErr)
                return res.status(500).json({
                  message: "Database error during insertion",
                  error: insertErr,
                });

              // Insert default follow-up
              const followupSql = `
              INSERT INTO partnerFollowup 
              (partnerId, role, followUp, followUpText, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `;
              db.query(
                followupSql,
                [
                  insertResult.insertId,
                  "Territory Partner",
                  "New",
                  "Newly Added Territory Partner",
                  currentdate,
                  currentdate,
                ],
                (followupErr) => {
                  if (followupErr)
                    return res.status(500).json({
                      message: "Follow-up insert failed",
                      error: followupErr,
                    });

                  return res.status(201).json({
                    message: "Territory Partner added successfully",
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
    console.error("Error adding Territory Partner:", err);
    res.status(500).json({ message: "Internal Server Error", error: err });
  }
};

// ---------------- EDIT TERRITORY PARTNER ----------------
export const edit = async (req, res) => {
  try {
    const partnerid = parseInt(req.params.id);
    if (isNaN(partnerid))
      return res.status(400).json({ message: "Invalid Partner ID" });

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
      adharno,
      panno,
      rerano,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
    } = req.body;

    if (!fullname || !contact || !email)
      return res.status(400).json({ message: "All fields are required" });

    // Upload new files to S3 if provided
    const [adharImageUrl, panImageUrl, reraImageUrl] = await Promise.all([
      uploadToS3(req.files?.["adharImage"]?.[0]),
      uploadToS3(req.files?.["panImage"]?.[0]),
      uploadToS3(req.files?.["reraImage"]?.[0]),
    ]);

    // Fetch old images
    db.query(
      "SELECT adharimage, panimage, reraimage FROM territorypartner WHERE id = ?",
      [partnerid],
      async (selectErr, results) => {
        if (selectErr)
          return res.status(500).json({
            message: "Database error while fetching old images",
            error: selectErr,
          });
        if (results.length === 0)
          return res.status(404).json({ message: "Partner not found" });

        const oldData = results[0];

        // Delete old images if replaced
        if (adharImageUrl) await deleteFromS3(oldData?.adharimage);
        if (panImageUrl) await deleteFromS3(oldData?.panimage);
        if (reraImageUrl) await deleteFromS3(oldData?.reraimage);

        // Prepare update
        let updateSql = `UPDATE territorypartner SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, pincode = ?, 
        experience = ?, adharno = ?, panno = ?, rerano = ?, bankname = ?, accountholdername = ?, accountnumber = ?, ifsc = ?, updated_at = ?`;
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
          adharno,
          panno,
          rerano,
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

        updateSql += ` WHERE id = ?`;
        updateValues.push(partnerid);

        db.query(updateSql, updateValues, (updateErr) => {
          if (updateErr)
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });

          res
            .status(200)
            .json({ message: "Territory Partner updated successfully" });
        });
      },
    );
  } catch (err) {
    console.error("Error updating Territory Partner:", err);
    res.status(500).json({ message: "Internal Server Error", error: err });
  }
};
