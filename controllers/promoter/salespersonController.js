import db from "../../config/dbconnect.js";
import moment from "moment";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

export const getAll = (req, res) => {
  const partnerAdderId = req.promoterUser?.id;
  if (!partnerAdderId) {
    return res.status(400).json({ message: "Invalid Id!" });
  }

  const paymentStatus = req.params.paymentStatus;
  if (!paymentStatus) {
    return res.status(401).json({ message: "Payment Status Not Selected" });
  }

  let sql;

  const followUpJoin = `
    LEFT JOIN (
      SELECT p1.*
      FROM partnerFollowup p1
      INNER JOIN (
        SELECT partnerId, MAX(created_at) AS latest
        FROM partnerFollowup
        WHERE role = 'Sales Person'
        GROUP BY partnerId
      ) p2 ON p1.partnerId = p2.partnerId AND p1.created_at = p2.latest
      WHERE p1.role = 'Sales Person'
    ) pf ON s.salespersonsid = pf.partnerId
  `;

  switch (paymentStatus) {
    case "Success":
      sql = `
        SELECT s.*, pf.followUp, pf.created_at AS followUpDate
        FROM salespersons s
        ${followUpJoin}
        WHERE s.paymentstatus = 'Success' AND s.partneradder = ${partnerAdderId} 
        ORDER BY s.created_at DESC`;
      break;

    case "Follow Up":
      sql = `
        SELECT s.*, pf.followUp, pf.created_at AS followUpDate
        FROM salespersons s
        ${followUpJoin}
        WHERE s.paymentstatus = 'Follow Up' AND s.loginstatus = 'Inactive' AND s.partneradder = ${partnerAdderId} 
        ORDER BY s.updated_at DESC`;
      break;

    case "Pending":
      sql = `
        SELECT s.*, pf.followUp, pf.created_at AS followUpDate
        FROM salespersons s
        ${followUpJoin}
        WHERE s.paymentstatus = 'Pending' AND s.partneradder = ${partnerAdderId} 
        ORDER BY s.created_at DESC`;
      break;

    case "Free":
      sql = `
        SELECT s.*, pf.followUp, pf.created_at AS followUpDate
        FROM salespersons s
        ${followUpJoin}
        WHERE s.paymentstatus != 'Success' AND s.loginstatus = 'Active' AND s.partneradder = ${partnerAdderId} 
        ORDER BY s.created_at DESC`;
      break;

    default:
      sql = `SELECT * FROM salespersons WHERE partneradder = ${partnerAdderId} ORDER BY salespersonsid DESC`;
  }

  db.query(sql, (err, salespersons) => {
    if (err) {
      console.error("Error fetching Salespersons:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Accurate count query with "Free"
    const countQuery = `
      SELECT 'Success' AS status, COUNT(*) AS count
      FROM salespersons
      WHERE paymentstatus = 'Success' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Pending', COUNT(*)
      FROM salespersons
      WHERE paymentstatus = 'Pending' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Follow Up', COUNT(*)
      FROM salespersons
      WHERE paymentstatus = 'Follow Up' AND loginstatus = 'Inactive' AND partneradder = ${partnerAdderId} 
      UNION ALL
      SELECT 'Free', COUNT(*)
      FROM salespersons
      WHERE paymentstatus != 'Success' AND loginstatus = 'Active' AND partneradder = ${partnerAdderId} 
    `;

    db.query(countQuery, (countErr, counts) => {
      if (countErr) {
        console.error("Error fetching status counts:", countErr);
        return res
          .status(500)
          .json({ message: "Database error", error: countErr });
      }

      const formatted = salespersons.map((row) => ({
        ...row,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
        followUp: row.followUp || null,
        followUpDate: row.followUpDate
          ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
          : null,
      }));

      const paymentStatusCounts = {};
      counts.forEach((item) => {
        paymentStatusCounts[item.status] = item.count;
      });

      return res.json({
        data: formatted,
        paymentStatusCounts,
      });
    });
  });
};

// **Add New Sales Person **
export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const partnerAdderId = req.promoterUser?.id;
  if (!partnerAdderId) {
    return res.status(400).json({ message: "Invalid Partner Adder ID" });
  }
  const { fullname, contact, email, intrest, refrence } = req.body;

  // Validate required fields
  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({
      message: "FullName, Contact and Email Required!",
    });
  }

  // Function to generate referral code
  const createReferralCode = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "REF-" + code; // Total 10 characters
  };

  // Check if referral is unique
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

  // Check for duplicates
  const checkSql = `SELECT * FROM salespersons WHERE contact = ? OR email = ?`;

  db.query(checkSql, [contact, email], (checkErr, checkResult) => {
    if (checkErr) {
      console.error("Error checking existing salesperson:", checkErr);
      return res.status(500).json({
        message: "Database error during validation",
        error: checkErr,
      });
    }

    if (checkResult.length > 0) {
      return res.status(409).json({
        message: "Sales person already exists with this Contact or Email Id.",
      });
    }

    // Generate unique referral code
    generateUniqueReferralCode((referralErr, referralCode) => {
      if (referralErr) {
        console.error("Referral code generation failed:", referralErr);
        return res.status(500).json({
          message: "Error generating referral code",
          error: referralErr,
        });
      }

      // Insert new salesperson
      const insertSql = `
        INSERT INTO salespersons 
        (fullname, contact, email, intrest, partneradder, refrence, referral, updated_at, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [
          fullname,
          contact,
          email,
          intrest,
          partnerAdderId,
          refrence,
          referralCode,
          currentdate,
          currentdate,
        ],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error("Error inserting Sales Person:", insertErr);
            return res.status(500).json({
              message: "Database error",
              error: insertErr,
            });
          }

          // Insert default follow-up entry
          const followupSql = `
            INSERT INTO partnerFollowup 
            (partnerId, role, followUp, followUpText, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          db.query(
            followupSql,
            [
              insertResult.insertId,
              "Sales Person",
              "New",
              "Newly Added Sales Person",
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
                message: "Sales Person added successfully",
                Id: insertResult.insertId,
              });
            },
          );
        },
      );
    });
  });
};

export const edit = async (req, res) => {
  try {
    const salespersonsid = parseInt(req.params.id);
    if (isNaN(salespersonsid)) {
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
      rerano,
      adharno,
      panno,
      bankname,
      accountholdername,
      accountnumber,
      ifsc,
    } = req.body;

    if (!fullname || !contact || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    /* ---------- FETCH OLD IMAGES ---------- */
    const old = await new Promise((resolve, reject) => {
      db.query(
        "SELECT adharimage, panimage, reraimage FROM salespersons WHERE salespersonsid = ?",
        [salespersonsid],
        (err, result) => {
          if (err) reject(err);
          resolve(result?.[0]);
        },
      );
    });

    let adharImage = old?.adharimage;
    let panImage = old?.panimage;
    let reraImage = old?.reraimage;

    /* ---------- HANDLE S3 UPLOAD ---------- */
    if (req.files?.["adharImage"]?.[0]) {
      if (adharImage) await deleteFromS3(adharImage);
      adharImage = await uploadToS3(req.files["adharImage"][0]);
    }

    if (req.files?.["panImage"]?.[0]) {
      if (panImage) await deleteFromS3(panImage);
      panImage = await uploadToS3(req.files["panImage"][0]);
    }

    if (req.files?.["reraImage"]?.[0]) {
      if (reraImage) await deleteFromS3(reraImage);
      reraImage = await uploadToS3(req.files["reraImage"][0]);
    }

    const updateSql = `
      UPDATE salespersons SET
      fullname=?, contact=?, email=?, intrest=?, address=?, state=?, city=?,
      pincode=?, experience=?, rerano=?, adharno=?, panno=?,
      bankname=?, accountholdername=?, accountnumber=?, ifsc=?,
      adharimage=?, panimage=?, reraimage=?, updated_at=?
      WHERE salespersonsid=?
    `;

    db.query(
      updateSql,
      [
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
        adharImage || null,
        panImage || null,
        reraImage || null,
        currentdate,
        salespersonsid,
      ],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(200).json({
          message: "Sales person updated successfully",
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
