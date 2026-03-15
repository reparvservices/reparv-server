import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

// **Fetch All**
export const getAll = (req, res) => {
  const partnerId = req.params.id;
  const sql =
    "SELECT * FROM builders WHERE builders.builderadder = ? ORDER BY builderid DESC";
  db.query(sql, [partnerId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const partnerId = req.params.id;
  const sql =
    "SELECT * FROM builders WHERE status = 'Active' AND builders.builderadder = ? ORDER BY company_name";
  db.query(sql, [partnerId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const builderid = parseInt(req.params.id);
  const sql = "SELECT * FROM builders WHERE builderid = ?";

  db.query(sql, [builderid], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Builder not found" });
    }
    res.json(result[0]);
  });
};

export const add = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    const {
      company_name,
      contact_person,
      contact,
      email,
      uid,
      office_address,
      registration_no,
      dor,
      projectpartnerid,
      state,
      city,
      website,
      notes,
      about,
      vision,
      mission,
      quality,
      whyChoose,
      expertise,
      experience,
    } = req.body;

    console.log(req.body);

    // 🔒 Login Check
    if (!projectpartnerid) {
      return res
        .status(401)
        .json({ message: "Unauthorized! Please login again." });
    }

    // 🔒 Required Field Validation
    if (!company_name || !contact_person || !contact) {
      return res.status(400).json({ message: "Required fields are missing" });
    }

    // -----------------------------------------
    // Upload Logo (Optional)
    // -----------------------------------------
    let userimage = null;

    if (req.file) {
      try {
        const uploadResult = await uploadToS3(req.file);
        userimage = uploadResult;
      } catch (err) {
        console.error("S3 Upload Error:", err);
        return res.status(500).json({ message: "Image upload failed" });
      }
    }

    console.log(userimage);

    // Convert arrays
    const whyChooseStr =
      whyChoose && Array.isArray(JSON.parse(whyChoose))
        ? whyChoose
        : JSON.stringify([]);

    const expertiseStr =
      expertise && Array.isArray(JSON.parse(expertise))
        ? expertise
        : JSON.stringify([]);

    // Duplicate check
    db.query(
      "SELECT builderid FROM builders WHERE contact = ? OR email = ?",
      [contact, email || ""],
      (err, result) => {
        if (err) {
          console.error("Duplicate check error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length > 0) {
          return res.status(409).json({ message: "Builder already exists!" });
        }

        // Insert builder
        const insertSQL = `
          INSERT INTO builders (
            builderadder,
            company_name,
            contact_person,
            contact,
            email,
            uid,
            office_address,
            registration_no,
            dor,
            website,
            notes,
            about,
            vision,
            mission,
            quality,
            why_choose,
            expertise,
            experience,
            userimage,
            updated_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertSQL,
          [
            projectpartnerid,
            company_name,
            contact_person,
            contact,
            email || null,
            uid || null,
            office_address || null,
            registration_no || null,
            dor || null,
            website || null,
            notes || null,
            about || null,
            vision || null,
            mission || null,
            quality || null,
            whyChooseStr,
            expertiseStr,
            experience || null,
            userimage,
            currentdate,
            currentdate,
          ],
          (err, result) => {
            if (err) {
              console.error("Insert Error:", err);
              return res
                .status(500)
                .json({ message: "Database error", error: err });
            }

            return res.status(201).json({
              success: true,
              message: "Builder added successfully",
              id: result.insertId,
              userimage,
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("Controller Error:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// **Edit Builder**

export const update = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.body.builderid;

  const {
    company_name,
    contact_person,
    contact,
    email,
    uid,
    office_address,
    registration_no,
    dor,
    website,
    notes,
    about,
    vision,
    mission,
    quality,
    whyChoose,
    expertise,
    experience,
  } = req.body;

  console.log("Update request body:", req.body);

  // ✅ Required fields validation
  if (!company_name || !contact_person || !contact) {
    return res.status(400).json({ message: "Required fields are missing" });
  }

  // ✅ Format date safely
  const formattedDate = moment(dor, "YYYY-MM-DD", true).isValid()
    ? moment(dor).format("YYYY-MM-DD")
    : null;

  // ✅ Convert arrays to JSON strings or set NULL
  const whyChooseValue =
    Array.isArray(whyChoose) && whyChoose.length > 0
      ? JSON.stringify(whyChoose)
      : null;

  const expertiseValue =
    Array.isArray(expertise) && expertise.length > 0
      ? JSON.stringify(expertise)
      : null;

  // ✅ Check if builder exists
  db.query(
    "SELECT builderid FROM builders WHERE builderid = ?",
    [Id],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Builder not found" });
      }

      // ✅ Update query
      const sql = `
      UPDATE builders SET
        company_name = ?,
        contact_person = ?,
        contact = ?,
        email = ?,
        uid = ?,
        office_address = ?,
        registration_no = ?,
        dor = ?,
        website = ?,
        notes = ?,
        about = ?,
        vision = ?,
        mission = ?,
        quality = ?,
        why_choose = ?,
        expertise = ?,
        experience = ?,
        updated_at = ?
      WHERE builderid = ?
    `;

      const values = [
        company_name,
        contact_person,
        contact,
        email || null,
        uid || null,
        office_address || null,
        registration_no || null,
        formattedDate,
        website || null,
        notes || null,
        about || null,
        vision || null,
        mission || null,
        quality || null,
        whyChooseValue,
        expertiseValue,
        experience || null,
        currentdate,
        Id,
      ];

      db.query(sql, values, (err) => {
        if (err) {
          console.error("Error updating builder:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        return res.status(200).json({
          success: true,
          message: "Builder updated successfully",
        });
      });
    },
  );
};

// **Delete**
export const deleteBuilder = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Builder ID" });
  }

  db.query(
    "SELECT * FROM builders WHERE builderid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Builder not found" });
      }

      db.query("DELETE FROM builders WHERE builderid = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Builder deleted successfully" });
      });
    },
  );
};

// **Change Status**
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Builder ID" });
  }

  db.query(
    "SELECT * FROM builders WHERE builderid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Builder not found" });
      }

      const newStatus = result[0].status === "Active" ? "Inactive" : "Active";

      db.query(
        "UPDATE builders SET status = ? WHERE builderid = ?",
        [newStatus, Id],
        (err) => {
          if (err) {
            console.error("Error updating status:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: `Builder status changed to ${newStatus}` });
        },
      );
    },
  );
};

// ** Assign Login to Builder **
export const assignLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const Id = parseInt(req.params.id);

    if (isNaN(Id)) {
      return res.status(400).json({ message: "Invalid Builder ID" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    db.query(
      "SELECT * FROM builders WHERE builderid = ?",
      [Id],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        if (result.length === 0) {
          return res.status(404).json({ message: "Builder not found" });
        }

        let loginstatus =
          result[0].loginstatus === "Active" ? "Inactive" : "Active";
        const email = result[0].email;

        db.query(
          "UPDATE builders SET loginstatus = ?, username = ?, password = ? WHERE builderid = ?",
          [loginstatus, username, hashedPassword, Id],
          (err, updateResult) => {
            if (err) {
              console.error("Error updating record:", err);
              return res
                .status(500)
                .json({ message: "Database error", error: err });
            }

            // Send email after successful update
            sendEmail(email, username, password, "Builder")
              .then(() => {
                res.status(200).json({
                  message:
                    "Builder login assigned successfully and email sent.",
                });
              })
              .catch((emailError) => {
                console.error("Error sending email:", emailError);
                res
                  .status(500)
                  .json({ message: "Login updated but email failed to send." });
              });
          },
        );
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
};
// ─────────────────────────────────────────────
// CHECK IF BUILDER CONTACT / EMAIL ALREADY EXISTS
// GET /api/builders/check-duplicate?contact=9876543210&email=abc@gmail.com
// ─────────────────────────────────────────────
export const checkDuplicate = async (req, res) => {
  console.log("check-duplicate query =>", req.query);
  try {
    const { contact, email } = req.query;

    if (!contact && !email) {
      return res
        .status(400)
        .json({ message: "Provide contact or email to check" });
    }

    const params = [];
    const conditions = [];

    if (contact) {
      conditions.push("contact = ?");
      params.push(contact);
    }

    if (email) {
      conditions.push("email = ?");
      params.push(email);
    }

    // ✅ SELECT contact and email — not just builderid
    const query =
      "SELECT builderid, contact, email FROM builders WHERE " +
      conditions.join(" OR ");

    db.query(query, params, (err, result) => {
      if (err) {
        console.error("Duplicate check error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      console.log("result =>", result);

      if (result.length === 0) {
        return res.status(200).json({ exists: false });
      }

      // ✅ r.contact now exists because we SELECT it above
      if (contact && result.some((r) => r.contact === contact)) {
        return res.status(200).json({
          exists: true,
          field: "contact",
          message: "This contact number is already registered",
        });
      }

      if (email && result.some((r) => r.email === email)) {
        return res.status(200).json({
          exists: true,
          field: "email",
          message: "This email is already registered",
        });
      }

      return res.status(200).json({ exists: false });
    });
  } catch (error) {
    console.error("Check duplicate error:", error);
    res.status(500).json({ message: "Server error", error });
  }
};
