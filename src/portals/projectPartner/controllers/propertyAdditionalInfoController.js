import db from "#db";
import moment from "moment-timezone";

// **Fetch All **
export const getAll = (req, res) => {
  const Id = parseInt(req.params.propertyid);
  if (!Id) {
    return res.status(400).json({ message: "Missing ID." });
  }

  const sql = "SELECT * FROM propertiesinfo WHERE propertyid = ? ORDER BY propertyinfoid DESC";
  db.query(sql, [Id], (err, result) => {
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
  const sql = "SELECT * FROM propertiesinfo WHERE propertyinfoid = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Info not found" });
    }
    res.json(result[0]);
  });
};

export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const propertyId = parseInt(req.params.id);
  if (!propertyId) {
    return res.status(400).json({ message: "Missing Property ID." });
  }
  const {
    mouza,
    khasrano,
    wing,
    wingfacing,
    plotfacing,
    plotsize,
    floorno,
    flatno,
    plotno,
    flatfacing,
    type,
    carpetarea,
    builtuparea,
    superbuiltuparea,
    additionalarea,
    payablearea,
    sqftprice,
    basiccost,
    stampduty,
    registration,
    advocatefee,
    watercharge,
    maintenance,
    gst,
    other,
    totalcost,
  } = req.body;

  // Validate mandatory fields (if needed)
  if (!mouza || !khasrano) {
    return res.status(400).json({ message: "Mouza and Khasra No are required." });
  }

  const insertSql = `
    INSERT INTO propertiesinfo (
      propertyid,
      mouza, khasrano, wing, wingfacing, plotfacing, plotsize, floorno, flatno, 
      plotno, flatfacing, type, carpetarea, builtuparea, superbuiltuparea, 
      additionalarea, payablearea, sqftprice, basiccost, stampduty, registration, 
      advocatefee, watercharge, maintenance, gst, other, totalcost, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    propertyId,
    mouza,
    khasrano,
    wing,
    wingfacing,
    plotfacing,
    plotsize,
    floorno,
    flatno,
    plotno,
    flatfacing,
    type,
    carpetarea || null,
    builtuparea || null,
    superbuiltuparea || null,
    additionalarea || null,
    payablearea,
    sqftprice,
    basiccost,
    stampduty || null,
    registration || null,
    advocatefee || null,
    watercharge || null,
    maintenance || null,
    gst || null,
    other || null,
    totalcost,
    currentdate,
    currentdate
  ];

  db.query(insertSql, values, (err, result) => {
    if (err) {
      console.error("Error adding property info:", err);
      return res
        .status(500)
        .json({ message: "Database insert error", error: err });
    }

    return res.status(201).json({
      message: "Property Info added successfully",
      propertyinfoid: result.insertId,
    });
  });
};

export const edit = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);
  if (!Id) {
    return res.status(400).json({ message: "Missing Property Info ID for update." });
  }

  const {
    mouza,
    khasrano,
    wing,
    wingfacing,
    plotfacing,
    plotsize,
    floorno,
    flatno,
    plotno,
    flatfacing,
    type,
    carpetarea,
    builtuparea,
    superbuiltuparea,
    additionalarea,
    payablearea,
    sqftprice,
    basiccost,
    stampduty,
    registration,
    advocatefee,
    watercharge,
    maintenance,
    gst,
    other,
    totalcost,
  } = req.body;

  const updateSql = `
    UPDATE propertiesinfo SET
      mouza = ?, khasrano = ?, wing = ?, wingfacing = ?, plotfacing = ?, plotsize = ?, floorno = ?, flatno = ?, 
      plotno = ?, flatfacing = ?, type = ?, carpetarea = ?, builtuparea = ?, superbuiltuparea = ?, 
      additionalarea = ?, payablearea = ?, sqftprice = ?, basiccost = ?, stampduty = ?, registration = ?, 
      advocatefee = ?, watercharge = ?, maintenance = ?, gst = ?, other = ?, totalcost = ?, updated_at = ?
    WHERE propertyinfoid = ?
  `;

  const values = [
    mouza,
    khasrano,
    wing,
    wingfacing,
    plotfacing,
    plotsize,
    floorno,
    flatno,
    plotno,
    flatfacing,
    type,
    carpetarea,
    builtuparea,
    superbuiltuparea,
    additionalarea,
    payablearea,
    sqftprice,
    basiccost,
    stampduty,
    registration,
    advocatefee,
    watercharge,
    maintenance,
    gst,
    other,
    totalcost,
    currentdate,
    Id,
  ];

  db.query(updateSql, values, (err, result) => {
    if (err) {
      console.error("Error updating property info:", err);
      return res
        .status(500)
        .json({ message: "Database update error", error: err });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "No record found for this ID." });
    }

    return res.status(200).json({ message: "Property Info updated successfully", result });
  });
};

///**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM propertiesinfo WHERE propertyinfoid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      let status = "";
      if (result[0].status === "Available") {
        status = "Booked";
      } else if (result[0].status === "Booked"){
        status = "Available";
      } else {
        status = result[0].status
      }
      console.log(status);
      db.query(
        "UPDATE propertiesinfo SET status = ? WHERE propertyinfoid = ?",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error changing status :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "status change successfully" });
        }
      );
    }
  );
};

//**Change status Into Reserved */
export const reserved = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM propertiesinfo WHERE propertyinfoid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      let status = "";
      if (result[0].status === "Available") {
        status = "Reserved";
      } else if (result[0].status === "Reserved"){
        status = "Available";
      } else {
        status = result[0].status
      }
      console.log(status);
      db.query(
        "UPDATE propertiesinfo SET status = ? WHERE propertyinfoid = ?",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error changing status :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "status change successfully" });
        }
      );
    }
  );
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM propertiesinfo WHERE propertyinfoid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "entry not found" });
      }

      db.query("DELETE FROM propertiesinfo WHERE propertyinfoid = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Entry deleted successfully" });
      });
    }
  );
};

// **Delete All Data **
export const deleteAllData = (req, res) => {
  const propertyId = parseInt(req.params.id);

  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  db.query(
    "SELECT * FROM propertiesinfo WHERE propertyid = ?",
    [propertyId],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Entries not found" });
      }

      db.query("DELETE FROM propertiesinfo WHERE propertyid = ?", [propertyId], (err) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "All Data Deleted Successfully" });
      });
    }
  );
};
