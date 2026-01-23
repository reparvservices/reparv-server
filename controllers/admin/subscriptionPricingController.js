import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM subscriptionPricing ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch All **
export const getAllPlans = (req, res) => {
  const partnerType = req.params.partnerType;

  const sql = `
    SELECT 
      sp.*, 
      rc.redeemCode, 
      rc.discount, 
      rc.startDate, 
      rc.endDate
    FROM subscriptionPricing AS sp
    LEFT JOIN redeem_codes AS rc 
      ON sp.id = rc.planId 
      AND rc.status = 'Active'
    WHERE sp.status = 'Active' 
      AND sp.partnerType = ?
    ORDER BY sp.totalPrice;
  `;

  db.query(sql, [partnerType], (err, result) => {
    if (err) {
      console.error("Error fetching plans:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = "SELECT * FROM subscriptionPricing WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Subscription Pricing not found" });
    }
    res.json(result[0]);
  });
};

// Add Subscription with 3 images
export const addSubscription = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { partnerType, planDuration, planName, totalPrice, features } =
    req.body;

  if (!partnerType || !planDuration || !planName || !totalPrice || !features) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Upload images to S3
    const firstImage = req.files?.firstImage
      ? await uploadToS3(req.files.firstImage[0])
      : null;

    const secondImage = req.files?.secondImage
      ? await uploadToS3(req.files.secondImage[0])
      : null;

    const thirdImage = req.files?.thirdImage
      ? await uploadToS3(req.files.thirdImage[0])
      : null;

    // Check if plan already exists
    db.query(
      "SELECT id FROM subscriptionPricing WHERE planName = ? AND planDuration = ?",
      [planName, planDuration],
      (err, result) => {
        if (err) {
          return res.status(500).json({
            message: "Database error",
            error: err,
          });
        }

        if (result.length > 0) {
          return res
            .status(202)
            .json({ message: "Subscription Plan already exists!" });
        }

        const insertSQL = `
          INSERT INTO subscriptionPricing
          (partnerType, planDuration, planName, totalPrice, features,
           firstImage, secondImage, thirdImage, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertSQL,
          [
            partnerType,
            planDuration,
            planName,
            totalPrice,
            features,
            firstImage,
            secondImage,
            thirdImage,
            currentdate,
            currentdate,
          ],
          (err, result) => {
            if (err) {
              return res.status(500).json({
                message: "Database error",
                error: err,
              });
            }

            return res.status(201).json({
              message: "Subscription Plan added successfully",
              Id: result.insertId,
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("S3 upload error:", error);
    return res.status(500).json({
      message: "Image upload failed",
      error,
    });
  }
};

export const updateSubscription = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { partnerType, planDuration, planName, totalPrice, features } =
    req.body;
  const id = parseInt(req.params.id);

  if (!partnerType || !planDuration || !planName || !totalPrice || !features) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    db.query(
      "SELECT * FROM subscriptionPricing WHERE id = ?",
      [id],
      async (err, result) => {
        if (err)
          return res
            .status(500)
            .json({ message: "Database error", error: err });

        if (result.length === 0)
          return res
            .status(404)
            .json({ message: "Subscription Plan not found" });

        const oldData = result[0];

        let firstImage = oldData.firstImage;
        let secondImage = oldData.secondImage;
        let thirdImage = oldData.thirdImage;

        if (req.files?.firstImage) {
          if (oldData.firstImage) await deleteFromS3(oldData.firstImage);
          firstImage = await uploadToS3(req.files.firstImage[0]);
        }

        if (req.files?.secondImage) {
          if (oldData.secondImage) await deleteFromS3(oldData.secondImage);
          secondImage = await uploadToS3(req.files.secondImage[0]);
        }

        if (req.files?.thirdImage) {
          if (oldData.thirdImage) await deleteFromS3(oldData.thirdImage);
          thirdImage = await uploadToS3(req.files.thirdImage[0]);
        }

        const updateSQL = `
          UPDATE subscriptionPricing 
          SET partnerType=?, planDuration=?, planName=?, totalPrice=?, features=?,
              firstImage=?, secondImage=?, thirdImage=?, updated_at=?
          WHERE id=?
        `;

        db.query(
          updateSQL,
          [
            partnerType,
            planDuration,
            planName,
            totalPrice,
            features,
            firstImage,
            secondImage,
            thirdImage,
            currentdate,
            id,
          ],
          (err) => {
            if (err)
              return res
                .status(500)
                .json({ message: "Database error", error: err });

            return res
              .status(200)
              .json({ message: "Subscription Plan updated successfully" });
          },
        );
      },
    );
  } catch (error) {
    return res.status(500).json({ message: "S3 operation failed", error });
  }
};
export const addOrUpdateSubscription = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { id, partnerType, planDuration, planName, totalPrice, features } =
    req.body;

  if (!partnerType || !planDuration || !planName || !totalPrice || !features) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    if (id) {
      // UPDATE
      db.query(
        "SELECT * FROM subscriptionPricing WHERE id = ?",
        [id],
        async (err, result) => {
          if (err)
            return res
              .status(500)
              .json({ message: "Database error", error: err });

          if (result.length === 0)
            return res
              .status(404)
              .json({ message: "Subscription Plan not found" });

          const oldData = result[0];

          let firstImage = oldData.firstImage;
          let secondImage = oldData.secondImage;
          let thirdImage = oldData.thirdImage;

          if (req.files?.firstImage) {
            if (oldData.firstImage) await deleteFromS3(oldData.firstImage);
            firstImage = await uploadToS3(req.files.firstImage[0]);
          }

          if (req.files?.secondImage) {
            if (oldData.secondImage) await deleteFromS3(oldData.secondImage);
            secondImage = await uploadToS3(req.files.secondImage[0]);
          }

          if (req.files?.thirdImage) {
            if (oldData.thirdImage) await deleteFromS3(oldData.thirdImage);
            thirdImage = await uploadToS3(req.files.thirdImage[0]);
          }

          const updateSQL = `
            UPDATE subscriptionPricing
            SET partnerType=?, planDuration=?, planName=?, totalPrice=?, features=?,
                firstImage=?, secondImage=?, thirdImage=?, updated_at=?
            WHERE id=?
          `;

          db.query(
            updateSQL,
            [
              partnerType,
              planDuration,
              planName,
              totalPrice,
              features,
              firstImage,
              secondImage,
              thirdImage,
              currentdate,
              id,
            ],
            (err) => {
              if (err)
                return res
                  .status(500)
                  .json({ message: "Database error", error: err });

              return res
                .status(200)
                .json({ message: "Subscription Plan updated successfully" });
            },
          );
        },
      );
    } else {
      // ADD
      db.query(
        "SELECT id FROM subscriptionPricing WHERE planName=? AND planDuration=?",
        [planName, planDuration],
        async (err, result) => {
          if (err)
            return res
              .status(500)
              .json({ message: "Database error", error: err });

          if (result.length > 0)
            return res
              .status(202)
              .json({ message: "Subscription Pricing Plan already exists!" });

          const firstImage = req.files?.firstImage
            ? await uploadToS3(req.files.firstImage[0])
            : null;

          const secondImage = req.files?.secondImage
            ? await uploadToS3(req.files.secondImage[0])
            : null;

          const thirdImage = req.files?.thirdImage
            ? await uploadToS3(req.files.thirdImage[0])
            : null;

          const insertSQL = `
            INSERT INTO subscriptionPricing
            (partnerType, planDuration, planName, totalPrice, features,
             firstImage, secondImage, thirdImage, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.query(
            insertSQL,
            [
              partnerType,
              planDuration,
              planName,
              totalPrice,
              features,
              firstImage,
              secondImage,
              thirdImage,
              currentdate,
              currentdate,
            ],
            (err, result) => {
              if (err)
                return res
                  .status(500)
                  .json({ message: "Database error", error: err });

              return res.status(201).json({
                message: "Subscription Plan added successfully",
                Id: result.insertId,
              });
            },
          );
        },
      );
    }
  } catch (error) {
    return res.status(500).json({ message: "S3 operation failed", error });
  }
};
// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM subscriptionPricing WHERE id = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res
          .status(404)
          .json({ message: "Subscription Pricing not found" });
      }

      db.query("DELETE FROM subscriptionPricing WHERE id = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(200)
          .json({ message: "Subscription Pricing deleted successfully" });
      });
    },
  );
};
//**Change status */
export const highlight = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM subscriptionPricing WHERE id = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      let status = "";
      if (result[0].highlight === "False") {
        status = "True";
      } else {
        status = "False";
      }
      //console.log(status);
      db.query(
        "UPDATE subscriptionPricing SET highlight = ? WHERE id = ?",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error changing highlight :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({
            message: "Subscription Plan highlight successfully",
          });
        },
      );
    },
  );
};
//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM subscriptionPricing WHERE id = ?",
    [Id],
    (err, result) => {
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
        "UPDATE subscriptionPricing SET status = ? WHERE id = ?",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({
            message: "Subscription Pricing status change successfully",
          });
        },
      );
    },
  );
};
