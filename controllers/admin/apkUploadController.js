import db from "../../config/dbconnect.js";
import fs from "fs";
import path from "path";
import moment from "moment-timezone";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM apks ORDER BY apkName";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = "SELECT * FROM apks WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Apk not found" });
    }
    res.json(result[0]);
  });
};

export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { apkName } = req.body;
  const apkFile = req.file;

  if (!apkName || !apkFile) {
    return res
      .status(400)
      .json({ message: "apkName and apkFile are required." });
  }

  // Check if apkName already exists
  db.query(
    "SELECT * FROM apks WHERE apkName = ?",
    [apkName],
    (err, results) => {
      if (err) {
        console.error("DB error during SELECT:", err);
        return res.status(500).json({ message: "Database error." });
      }

      if (results.length > 0) {
        return res.status(202).json({ message: "APK already exists." });
      }

      // Prepare new APK record
      const newApk = {
        apkName,
        filePath: apkFile.path,
        fileName: apkFile.filename,
        status: "Active",
        updated_at: currentdate,
        created_at: currentdate,
      };

      // Insert new APK
      db.query("INSERT INTO apks SET ?", newApk, (insertErr, insertResult) => {
        if (insertErr) {
          console.error("DB error during INSERT:", insertErr);
          return res.status(500).json({ message: "Failed to insert APK." });
        }

        return res.status(201).json({ message: "APK uploaded successfully." });
      });
    }
  );
};


export const update = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { apkName } = req.body;
  const apkFile = req.file;
  const { id } = req.params;

  if (!id || !apkName || !apkFile) {
    return res
      .status(400)
      .json({ message: "id, apkName, and apkFile are required." });
  }

  // Step 1: Check if APK exists by ID
  db.query("SELECT * FROM apks WHERE id = ?", [id], (err, results) => {
    if (err) {
      console.error("DB error during SELECT by ID:", err);
      return res.status(500).json({ message: "Database error." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "APK not found." });
    }

    const oldApk = results[0];

    // Step 2: Delete old file from server (if it exists)
    if (oldApk.filePath && fs.existsSync(oldApk.filePath)) {
      fs.unlink(oldApk.filePath, (fsErr) => {
        if (fsErr) {
          console.error("Failed to delete old APK file:", fsErr);
          // Optional: return res.status(500) if you want to fail update if file deletion fails
        }
      });
    }

    // Step 3: Prepare new APK data
    const updatedApk = {
      apkName,
      filePath: apkFile.path,
      fileName: apkFile.filename,
      updated_at: currentdate,
    };

    // Step 4: Update the DB record
    db.query(
      "UPDATE apks SET ? WHERE id = ?",
      [updatedApk, id],
      (updateErr, updateResult) => {
        if (updateErr) {
          console.error("DB error during UPDATE:", updateErr);
          return res.status(500).json({ message: "Failed to update APK." });
        }

        return res.status(200).json({ message: "APK updated successfully." });
      }
    );
  });
};


//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Role ID" });
  }

  db.query("SELECT * FROM apks WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    let status = "";
    if (result[0].status === "Active") {
      status = "Inactive";
    } else {
      status = "Active";
    }
    console.log(status);
    db.query(
      "UPDATE apks SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error status changing :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Apk status change successfully" });
      }
    );
  });
};

// ** Delete Apk **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  // Step 1: Get the APK record to find file path
  db.query("SELECT * FROM apks WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "APK not found" });
    }

    const apk = result[0];
    const filePath = apk.filePath;

    // Step 2: Delete the file if it exists
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (fsErr) => {
        if (fsErr) {
          console.error("Error deleting APK file:", fsErr);
          // Continue even if file delete fails — optional behavior
        }
      });
    }

    // Step 3: Delete the DB record
    db.query("DELETE FROM apks WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting DB record:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({ message: "APK and file deleted successfully" });
    });
  });
};
