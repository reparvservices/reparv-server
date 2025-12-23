import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";

const saltRounds = 10;

// **Fetch All Builders (For Employee Only)**
export const getAll = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }

  // Step 1: Fetch the Project Partner's adharno using projectpartnerid
  const getProjectPartnerAdharQuery =
    "SELECT adharno FROM projectpartner WHERE id = ?";

  db.query(getProjectPartnerAdharQuery, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching Project Partner adharno:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Project Partner not found." });
    }

    const projectPartnerAdhar = result[0].adharno;

    // Step 2: Fetch all builders added by this Project Partner
    const fetchBuildersQuery =
      "SELECT * FROM builders WHERE builders.builderadder = ? ORDER BY builderid DESC";

    db.query(fetchBuildersQuery, [projectPartnerAdhar], (err, builders) => {
      if (err) {
        console.error("Error fetching builders:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      const formatted = builders.map((row) => ({
        ...row,
        created_at: row.created_at
          ? moment(row.created_at).format("DD MMM YYYY | hh:mm A")
          : null,
        updated_at: row.updated_at
          ? moment(row.updated_at).format("DD MMM YYYY | hh:mm A")
          : null,
      }));

      res.json(formatted);
    });
  });
};

// **Fetch All Active Builders (For Employee Only)**
export const getAllActive = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }

  // Step 1: Get project partner's adharno
  const getPartnerAdharQuery = "SELECT adharno FROM projectpartner WHERE id = ?";

  db.query(getPartnerAdharQuery, [projectPartnerId], (err, partnerResult) => {
    if (err) {
      console.error("Error fetching project partner adharno:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (partnerResult.length === 0) {
      return res.status(404).json({ message: "Project Partner not found." });
    }

    const projectPartnerAdhar = partnerResult[0].adharno;

    // Step 2: Fetch all active builders added by this partner
    const sql =
      "SELECT * FROM builders WHERE status = 'Active' AND builders.builderadder = ? ORDER BY company_name";

    db.query(sql, [projectPartnerAdhar], (err, result) => {
      if (err) {
        console.error("Error fetching active builders:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
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

// **Add New Builder (For Employee Only)**
export const add = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please login as an employee." });
  }

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
    website,
    notes,
  } = req.body;

  // Validation
  if (
    !company_name ||
    !contact_person ||
    !contact ||
    !email ||
    !registration_no ||
    !dor
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Step 1: Fetch project partner's adharno using their ID
  const getPartnerAdharQuery = "SELECT adharno FROM projectpartner WHERE id = ?";

  db.query(getPartnerAdharQuery, [projectPartnerId], (err, partnerResult) => {
    if (err) {
      console.error("Error fetching project partner adharno:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (partnerResult.length === 0) {
      return res.status(404).json({ message: "Project Partner not found." });
    }

    const partnerAdhar = partnerResult[0].adharno;

    // Step 2: Check for duplicate contact/email
    db.query(
      "SELECT * FROM builders WHERE contact = ? OR email = ?",
      [contact, email],
      (err, result) => {
        if (err)
          return res.status(500).json({ message: "Database error", error: err });

        if (result.length > 0) {
          return res.status(409).json({ message: "Builder already exists!" });
        }

        // Step 3: Insert new builder
        const insertSQL = `
          INSERT INTO builders 
          (builderadder, company_name, contact_person, contact, email, uid, office_address, registration_no, dor, website, notes, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertSQL,
          [
            partnerAdhar,
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
            currentdate,
            currentdate,
          ],
          (err, result) => {
            if (err) {
              console.error("Error inserting builder:", err);
              return res
                .status(500)
                .json({ message: "Database error", error: err });
            }

            res.status(201).json({
              message: "Builder added successfully",
              builderId: result.insertId,
            });
          }
        );
      }
    );
  });
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
  } = req.body;

  if (
    !company_name ||
    !contact_person ||
    !contact ||
    !email ||
    !registration_no ||
    !dor
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query(
    "SELECT * FROM builders WHERE builderid = ?",
    [Id],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0)
        return res.status(404).json({ message: "Builder not found" });

      const sql = `UPDATE builders SET company_name=?, contact_person=?, contact=?, email=?, uid=?, office_address=?, registration_no=?, dor=?, website=?, notes=?, updated_at=? WHERE builderid=?`;

      db.query(
        sql,
        [
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
          currentdate,
          Id,
        ],
        (err) => {
          if (err) {
            console.error("Error updating:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({ message: "Builder updated successfully" });
        }
      );
    }
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
    }
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
        }
      );
    }
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
          }
        );
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
};
