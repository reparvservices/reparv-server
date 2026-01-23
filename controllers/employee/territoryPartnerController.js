import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

export const getAll = (req, res) => {
    const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
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

  db.query(sql, [projectPartnerId], (err, result) => {
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
  const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql =
    "SELECT * FROM territorypartner WHERE status = 'Active' AND projectpartnerid = ? ORDER BY id DESC";
  db.query(sql, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Add New Territory Partner **

export const add = async (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }

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

  // Validate required fields
  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({ message: "All Fields required!" });
  }

  // Generate referral code
  const createReferralCode = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "REF-" + code; // Total 10 characters
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
      }
    );
  };

  try {
    // STEP 1: Upload files to S3 (if provided)
    let adharImageUrl = null;
    let panImageUrl = null;
    let reraImageUrl = null;

    if (req.files?.["adharImage"]?.[0]) {
      adharImageUrl = await uploadToS3(req.files["adharImage"][0]);
    }
    if (req.files?.["panImage"]?.[0]) {
      panImageUrl = await uploadToS3(req.files["panImage"][0]);
    }
    if (req.files?.["reraImage"]?.[0]) {
      reraImageUrl = await uploadToS3(req.files["reraImage"][0]);
    }

    // STEP 2: Check duplicates
    const checkSql = `SELECT * FROM territorypartner WHERE contact = ? OR email = ?`;
    db.query(checkSql, [contact, email], (checkErr, checkResult) => {
      if (checkErr) {
        console.error("Error checking existing Territory Partner:", checkErr);
        return res.status(500).json({
          message: "Database error during validation",
          error: checkErr,
        });
      }

      if (checkResult.length > 0) {
        return res.status(409).json({
          message: "Territory Partner already exists with this Contact or Email.",
        });
      }

      // STEP 3: Generate unique referral code
      generateUniqueReferralCode((referralErr, referralCode) => {
        if (referralErr) {
          console.error("Error generating referral:", referralErr);
          return res.status(500).json({
            message: "Referral code generation failed",
            error: referralErr,
          });
        }

        // STEP 4: Insert new territory partner
        const insertSql = `
          INSERT INTO territorypartner 
          (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, adharno, panno, rerano, 
           bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, updated_at, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
        `;

        db.query(
          insertSql,
          [
            projectPartnerId,
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
            if (insertErr) {
              console.error("Error inserting Territory Partner:", insertErr);
              return res.status(500).json({
                message: "Database error during insertion",
                error: insertErr,
              });
            }

            // STEP 5: Insert follow-up for the new Territory Partner
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
                if (followupErr) {
                  console.error("Error adding follow-up:", followupErr);
                  return res.status(500).json({
                    message: "Follow-up insert failed",
                    error: followupErr,
                  });
                }

                return res.status(201).json({
                  message: "Territory Partner added successfully",
                  Id: insertResult.insertId,
                });
              }
            );
          }
        );
      });
    });
  } catch (err) {
    console.error("Error uploading images to S3:", err);
    return res.status(500).json({
      message: "Error uploading images to S3",
      error: err,
    });
  }
};


export const edit = async (req, res) => {
  const partnerid = parseInt(req.params.id);
  if (isNaN(partnerid)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

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

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // STEP 1: Fetch old images
    db.query(
      "SELECT adharimage, panimage, reraimage FROM territorypartner WHERE id = ?",
      [partnerid],
      async (selectErr, results) => {
        if (selectErr) {
          console.error("Error fetching old images:", selectErr);
          return res
            .status(500)
            .json({ message: "Database error while fetching old images" });
        }

        if (results.length === 0) {
          return res.status(404).json({ message: "Partner not found" });
        }

        const oldData = results[0];

        // STEP 2: Upload new files to S3 if provided
        const adharImageFile = req.files?.["adharImage"]?.[0];
        const panImageFile = req.files?.["panImage"]?.[0];
        const reraImageFile = req.files?.["reraImage"]?.[0];

        let adharImageUrl = oldData?.adharimage;
        let panImageUrl = oldData?.panimage;
        let reraImageUrl = oldData?.reraimage;

        if (adharImageFile) {
          if (adharImageUrl) await deleteFromS3(adharImageUrl);
          adharImageUrl = await uploadToS3(adharImageFile);
        }

        if (panImageFile) {
          if (panImageUrl) await deleteFromS3(panImageUrl);
          panImageUrl = await uploadToS3(panImageFile);
        }

        if (reraImageFile) {
          if (reraImageUrl) await deleteFromS3(reraImageUrl);
          reraImageUrl = await uploadToS3(reraImageFile);
        }

        // STEP 3: Prepare SQL
        const updateSql = `
          UPDATE territorypartner
          SET fullname=?, contact=?, email=?, intrest=?,
              address=?, state=?, city=?, pincode=?, experience=?,
              adharno=?, panno=?, rerano=?, bankname=?,
              accountholdername=?, accountnumber=?, ifsc=?,
              adharimage=?, panimage=?, reraimage=?, updated_at=?
          WHERE id=?
        `;

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
          adharImageUrl,
          panImageUrl,
          reraImageUrl,
          currentdate,
          partnerid,
        ];

        // STEP 4: Update DB
        db.query(updateSql, updateValues, (updateErr) => {
          if (updateErr) {
            console.error("Error updating Territory Partner:", updateErr);
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });
          }

          res.status(200).json({
            message: "Territory Partner updated successfully",
          });
        });
      }
    );
  } catch (err) {
    console.error("Error in S3 operations:", err);
    return res.status(500).json({
      message: "Error uploading or deleting images from S3",
      error: err,
    });
  }
};

