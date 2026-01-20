import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { uploadToS3 } from "../../utils/imageUpload.js";

export const getAll = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message:
        "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql = `
      SELECT salespersons.*, pf.followUp, pf.created_at AS followUpDate
      FROM salespersons
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
      ) pf ON salespersons.salespersonsid = pf.partnerId
      WHERE salespersons.projectpartnerid = ?
      ORDER BY salespersons.created_at DESC;
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

// **Fetch All Active**
export const getAllActive = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message:
        "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql =
    "SELECT * FROM salespersons WHERE status = 'Active' AND salespersons.projectpartnerid = ? ORDER BY salespersonsid DESC";
  db.query(sql, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// --- ADD NEW SALES PERSON ---
export const add = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message:
        "Unauthorized Access — Employee is not linked to any Project Partner.",
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
    rerano,
    adharno,
    panno,
    bankname,
    accountholdername,
    accountnumber,
    ifsc,
  } = req.body;

  if (!fullname || !contact || !email || !intrest) {
    return res.status(400).json({
      message: "FullName, Contact and Email Required!",
    });
  }

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

  // --- Upload files to S3 ---
  const uploadFilesToS3 = async () => {
    const adharImageFile = req.files?.["adharImage"]?.[0];
    const panImageFile = req.files?.["panImage"]?.[0];
    const reraImageFile = req.files?.["reraImage"]?.[0];

    const adharImageUrl = adharImageFile
      ? await uploadToS3(adharImageFile)
      : null;
    const panImageUrl = panImageFile ? await uploadToS3(panImageFile) : null;
    const reraImageUrl = reraImageFile ? await uploadToS3(reraImageFile) : null;

    return { adharImageUrl, panImageUrl, reraImageUrl };
  };

  db.query(
    "SELECT * FROM salespersons WHERE contact = ? OR email = ?",
    [contact, email],
    async (checkErr, checkResult) => {
      if (checkErr)
        return res
          .status(500)
          .json({
            message: "Database error during validation",
            error: checkErr,
          });

      if (checkResult.length > 0)
        return res.status(409).json({
          message: "Sales person already exists with this Contact or Email Id.",
        });

      try {
        const { adharImageUrl, panImageUrl, reraImageUrl } =
          await uploadFilesToS3();

        generateUniqueReferralCode((referralErr, referralCode) => {
          if (referralErr)
            return res
              .status(500)
              .json({
                message: "Error generating referral code",
                error: referralErr,
              });

          const insertSql = `
            INSERT INTO salespersons 
            (projectpartnerid, fullname, contact, email, intrest, refrence, referral, address, state, city, pincode, experience, rerano, adharno, panno, 
             bankname, accountholdername, accountnumber, ifsc, adharimage, panimage, reraimage, updated_at, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              currentdate,
              currentdate,
            ],
            (insertErr, insertResult) => {
              if (insertErr)
                return res
                  .status(500)
                  .json({ message: "Database error", error: insertErr });

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
                  if (followupErr)
                    return res
                      .status(500)
                      .json({
                        message: "Follow-up insert failed",
                        error: followupErr,
                      });

                  return res.status(201).json({
                    message: "Sales Person added successfully",
                    Id: insertResult.insertId,
                  });
                },
              );
            },
          );
        });
      } catch (err) {
        console.error("Error uploading files to S3:", err);
        return res
          .status(500)
          .json({ message: "File upload failed", error: err });
      }
    },
  );
};

// --- EDIT SALES PERSON ---
export const edit = (req, res) => {
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
  if (isNaN(salespersonsid)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  if (!fullname || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // --- Upload new files to S3 ---
  const uploadNewFilesToS3 = async () => {
    const adharImageFiles = req.files?.["adharImage"] || [];
    const panImageFiles = req.files?.["panImage"] || [];
    const reraImageFiles = req.files?.["reraImage"] || [];

    const adharImageUrls = [];
    const panImageUrls = [];
    const reraImageUrls = [];

    for (const file of adharImageFiles)
      adharImageUrls.push(await uploadToS3(file));
    for (const file of panImageFiles) panImageUrls.push(await uploadToS3(file));
    for (const file of reraImageFiles)
      reraImageUrls.push(await uploadToS3(file));

    return { adharImageUrls, panImageUrls, reraImageUrls };
  };

  db.query(
    "SELECT adharimage, panimage, reraimage FROM salespersons WHERE salespersonsid = ?",
    [salespersonsid],
    async (selectErr, results) => {
      if (selectErr)
        return res
          .status(500)
          .json({ message: "Database error while fetching old images" });

      const oldData = results[0];

      const deleteOldFiles = (oldImagesJson) => {
        try {
          const oldImages = JSON.parse(oldImagesJson || "[]");
          oldImages.forEach((url) => {
            const filePath = path.join(process.cwd(), "public", url);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          });
        } catch (err) {
          console.error("Error deleting old files:", err);
        }
      };

      try {
        const { adharImageUrls, panImageUrls, reraImageUrls } =
          await uploadNewFilesToS3();

        let updateSql = `UPDATE salespersons 
          SET fullname = ?, contact = ?, email = ?, intrest = ?, address = ?, state = ?, city = ?, 
          pincode = ?, experience = ?, rerano = ?, adharno = ?, panno = ?, bankname = ?, 
          accountholdername = ?, accountnumber = ?, ifsc = ?, updated_at = ?`;
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

        if (adharImageUrls.length > 0) {
          updateSql += `, adharimage = ?`;
          updateValues.push(JSON.stringify(adharImageUrls));
          deleteOldFiles(oldData?.adharimage);
        }
        if (panImageUrls.length > 0) {
          updateSql += `, panimage = ?`;
          updateValues.push(JSON.stringify(panImageUrls));
          deleteOldFiles(oldData?.panimage);
        }
        if (reraImageUrls.length > 0) {
          updateSql += `, reraimage = ?`;
          updateValues.push(JSON.stringify(reraImageUrls));
          deleteOldFiles(oldData?.reraimage);
        }

        updateSql += ` WHERE salespersonsid = ?`;
        updateValues.push(salespersonsid);

        db.query(updateSql, updateValues, (updateErr) => {
          if (updateErr)
            return res
              .status(500)
              .json({
                message: "Database error during update",
                error: updateErr,
              });

          res
            .status(200)
            .json({ message: "Sales person updated successfully" });
        });
      } catch (err) {
        console.error("Error uploading files to S3:", err);
        return res
          .status(500)
          .json({ message: "File upload failed", error: err });
      }
    },
  );
};
