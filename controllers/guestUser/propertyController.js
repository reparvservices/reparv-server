import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { convertImagesToWebp } from "../../utils/convertImagesToWebp.js";
import { sanitize } from "../../utils/sanitize.js";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

const calculateEMI = (principal, rate = 9, years = 20) => {
  const monthlyRate = rate / 12 / 100;
  const months = years * 12;

  if (monthlyRate === 0) return principal / months;

  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return Math.round(emi);
};

// **Fetch All Properties**
export const getAll = (req, res) => {
  const sql = `SELECT properties.*, builders.company_name FROM properties 
               LEFT JOIN builders ON properties.builderid = builders.builderid 
               WHERE properties.guestUserId = ? 
               ORDER BY properties.propertyid DESC`;
  db.query(sql, [req.guestUser?.id], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single Property by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Property ID" });

  const sql = `SELECT properties.*, builders.company_name FROM properties 
  LEFT JOIN builders on builders.builderid = properties.builderid
  WHERE properties.propertyid = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }
    // safely parse JSON fields
    const formatted = result.map((row) => {
      let parsedType = null;
      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
        parsedType = [];
      }

      return {
        ...row,
        propertyType: parsedType,
      };
    });

    res.json(formatted[0]);
  });
};

// get all images
export const getImages = (req, res) => {
  const partnerId = req.user.id;
  if (!partnerId) {
    return res.status(400).json({ message: "Unauthorized Access" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = "SELECT * FROM propertiesimages WHERE propertyid = ?";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property images:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }
    res.json(result);
  });
};
export const addProperty = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const partnerId = req.guestUser?.id;

    if (!partnerId) {
      return res.status(401).json({ message: "Unauthorized Access" });
    }

    const {
      propertyCategory,
      propertyName,
      totalSalesPrice,
      totalOfferPrice,
      builtUpArea,
      carpetArea,
      state,
      city,
    } = req.body;

    /* ---------- DUPLICATE PROPERTY CHECK ---------- */
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [propertyName],
      async (err, result) => {
        if (err)
          return res
            .status(500)
            .json({ message: "Database error", error: err });

        if (result.length > 0) {
          return res
            .status(409)
            .json({ message: "Property name already exists!" });
        }

        /* ---------- UPLOAD IMAGES TO S3 (FIELD-WISE) ---------- */
        const uploadFieldToS3 = async (field) => {
          if (!req.files || !req.files[field]) return null;

          const urls = [];
          for (const file of req.files[field]) {
            const url = await uploadToS3(file);
            urls.push(url);
          }
          return JSON.stringify(urls);
        };

        const frontView = await uploadFieldToS3("frontView");
        const sideView = await uploadFieldToS3("sideView");
        const kitchenView = await uploadFieldToS3("kitchenView");
        const hallView = await uploadFieldToS3("hallView");
        const bedroomView = await uploadFieldToS3("bedroomView");
        const bathroomView = await uploadFieldToS3("bathroomView");
        const balconyView = await uploadFieldToS3("balconyView");
        const nearestLandmark = await uploadFieldToS3("nearestLandmark");
        const developedAmenities = await uploadFieldToS3("developedAmenities");

        /* ---------- INSERT PROPERTY ---------- */
        const insertSQL = `
          INSERT INTO properties (
            guestUserId, propertyCategory,
            propertyName, totalSalesPrice,
            totalOfferPrice, builtUpArea, carpetArea,
            state, city,
            frontView, sideView, kitchenView, hallView,
            bedroomView, bathroomView, balconyView,
            nearestLandmark, developedAmenities,
            updated_at, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          partnerId,
          propertyCategory,
          propertyName,
          totalSalesPrice,
          totalOfferPrice,
          builtUpArea,
          carpetArea,
          state,
          city,
          frontView,
          sideView,
          kitchenView,
          hallView,
          bedroomView,
          bathroomView,
          balconyView,
          nearestLandmark,
          developedAmenities,
          currentdate,
          currentdate,
        ];

        db.query(insertSQL, values, (err, insertResult) => {
          if (err)
            return res
              .status(500)
              .json({ message: "Insert failed", error: err });

          const newPropertyId = insertResult.insertId;

          /* ---------- GENERATE propertyCityId ---------- */
          db.query(
            "SELECT cityNACL FROM cities WHERE city = ? LIMIT 1",
            [city],
            (err2, cityResult) => {
              if (err2)
                return res
                  .status(500)
                  .json({ message: "City lookup failed", error: err2 });

              if (cityResult.length === 0)
                return res
                  .status(404)
                  .json({ message: "City not found in database" });

              const cityNACL = cityResult[0].cityNACL;
              const propertyCityId = `${cityNACL}-${newPropertyId}`;

              db.query(
                "UPDATE properties SET propertyCityId = ? WHERE propertyid = ?",
                [propertyCityId, newPropertyId],
                (err3) => {
                  if (err3)
                    return res.status(500).json({
                      message: "Failed to update propertyCityId",
                      error: err3,
                    });

                  return res.status(201).json({
                    message: "Property added successfully",
                    id: newPropertyId,
                    propertyCityId,
                  });
                },
              );
            },
          );
        });
      },
    );
  } catch (error) {
    console.error("Add property error:", error);
    return res.status(500).json({
      message: "Server error",
      error,
    });
  }
};

const uploadImagesFieldToS3 = async (files, field) => {
  if (!files || !files[field]) return null;

  const urls = [];
  for (const file of files[field]) {
    const url = await uploadToS3(file);
    urls.push(url);
  }
  return JSON.stringify(urls);
};

const deleteOldImages = async (existingJson) => {
  if (!existingJson) return;
  try {
    const images = JSON.parse(existingJson);
    for (const img of images) {
      await deleteFromS3(img);
    }
  } catch (e) {
    console.warn("Image delete skipped:", e.message);
  }
};

export const update = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const files = await convertImagesToWebp(req.files);

    const partnerId = req.guestUser?.id;
    if (!partnerId) {
      return res.status(400).json({ message: "Unauthorized Access" });
    }

    const Id = req.params.id ? parseInt(req.params.id) : null;
    if (!Id) {
      return res.status(400).json({ message: "Invalid property ID" });
    }

    /* ---------------- VALIDATION (unchanged) ---------------- */
    const {
      builderid,
      projectBy,
      possessionDate,
      propertyCategory,
      propertyApprovedBy,
      propertyName,
      address,
      state,
      city,
      pincode,
      location,
      distanceFromCityCenter,
      latitude,
      longitude,
      totalSalesPrice,
      totalOfferPrice,
      stampDuty,
      gst,
      advocateFee,
      msebWater,
      maintenance,
      other,
      tags,
      propertyType,
      builtYear,
      ownershipType,
      builtUpArea,
      carpetArea,
      parkingAvailability,
      totalFloors,
      floorNo,
      loanAvailability,
      propertyFacing,
      reraRegistered,
      furnishing,
      waterSupply,
      powerBackup,
      locationFeature,
      sizeAreaFeature,
      parkingFeature,
      terraceFeature,
      ageOfPropertyFeature,
      amenitiesFeature,
      propertyStatusFeature,
      smartHomeFeature,
      securityBenefit,
      primeLocationBenefit,
      rentalIncomeBenefit,
      qualityBenefit,
      capitalAppreciationBenefit,
      ecofriendlyBenefit,
    } = req.body;

    /* ---------------- CALCULATIONS ---------------- */
    const emi = calculateEMI(Number(totalOfferPrice));

    let registrationFees =
      totalOfferPrice > 3000000
        ? (30000 / totalOfferPrice) * 100
        : ["RentalFlat", "RentalShop", "RentalOffice"].includes(
              propertyCategory,
            )
          ? 0
          : 1;

    const formattedPossessionDate =
      possessionDate && moment(possessionDate, moment.ISO_8601, true).isValid()
        ? moment(possessionDate).format("YYYY-MM-DD")
        : null;

    const propertyTypeJson = JSON.stringify(
      Array.isArray(propertyType)
        ? propertyType
        : propertyType
            ?.split(",")
            .map((v) => v.trim())
            .filter(Boolean) || [],
    );

    /* ---------------- FETCH EXISTING PROPERTY ---------------- */
    db.query(
      "SELECT * FROM properties WHERE propertyid = ?",
      [Id],
      async (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (!result.length) {
          return res.status(404).json({ message: "Property not found" });
        }

        const existing = result[0];
        const approve = ["Rejected", "Not Approved"].includes(existing.approve)
          ? "Not Approved"
          : "Approved";

        /* ---------------- IMAGE HANDLING (S3) ---------------- */
        const imageFields = [
          "frontView",
          "sideView",
          "kitchenView",
          "hallView",
          "bedroomView",
          "bathroomView",
          "balconyView",
          "nearestLandmark",
          "developedAmenities",
        ];

        const imageData = {};

        for (const field of imageFields) {
          if (files && files[field]) {
            await deleteOldImages(existing[field]);
            imageData[field] = await uploadImagesFieldToS3(files, field);
          } else {
            imageData[field] = existing[field];
          }
        }

        /* ---------------- UPDATE QUERY ---------------- */
        const updateSQL = `
          UPDATE properties SET rejectreason=NULL, approve=?,
          builderid=?, projectBy=?, possessionDate=?, propertyCategory=?, propertyApprovedBy=?,
          propertyName=?, address=?, state=?, city=?, pincode=?, location=?,
          distanceFromCityCenter=?, latitude=?, longitude=?, totalSalesPrice=?, totalOfferPrice=?,
          emi=?, stampDuty=?, registrationFee=?, gst=?, advocateFee=?, msebWater=?,
          maintenance=?, other=?, tags=?, propertyType=?, builtYear=?, ownershipType=?,
          builtUpArea=?, carpetArea=?, parkingAvailability=?, totalFloors=?, floorNo=?,
          loanAvailability=?, propertyFacing=?, reraRegistered=?, furnishing=?, waterSupply=?,
          powerBackup=?, locationFeature=?, sizeAreaFeature=?, parkingFeature=?, terraceFeature=?,
          ageOfPropertyFeature=?, amenitiesFeature=?, propertyStatusFeature=?, smartHomeFeature=?,
          securityBenefit=?, primeLocationBenefit=?, rentalIncomeBenefit=?, qualityBenefit=?,
          capitalAppreciationBenefit=?, ecofriendlyBenefit=?,
          frontView=?, sideView=?, kitchenView=?, hallView=?, bedroomView=?, bathroomView=?,
          balconyView=?, nearestLandmark=?, developedAmenities=?, updated_at=?
          WHERE propertyid = ?
        `;

        const values = [
          approve,
          builderid,
          sanitize(projectBy),
          formattedPossessionDate,
          propertyCategory,
          propertyApprovedBy,
          propertyName,
          address,
          state,
          city,
          pincode,
          location,
          distanceFromCityCenter,
          latitude,
          longitude,
          totalSalesPrice,
          totalOfferPrice,
          emi,
          stampDuty,
          registrationFees,
          gst,
          advocateFee,
          msebWater,
          maintenance,
          other,
          tags,
          propertyTypeJson,
          builtYear,
          ownershipType,
          builtUpArea,
          carpetArea,
          parkingAvailability,
          totalFloors,
          floorNo,
          loanAvailability,
          propertyFacing,
          reraRegistered,
          furnishing,
          waterSupply,
          powerBackup,
          locationFeature,
          sizeAreaFeature,
          parkingFeature,
          terraceFeature,
          ageOfPropertyFeature,
          amenitiesFeature,
          propertyStatusFeature,
          smartHomeFeature,
          securityBenefit,
          primeLocationBenefit,
          rentalIncomeBenefit,
          qualityBenefit,
          capitalAppreciationBenefit,
          ecofriendlyBenefit,
          imageData.frontView,
          imageData.sideView,
          imageData.kitchenView,
          imageData.hallView,
          imageData.bedroomView,
          imageData.bathroomView,
          imageData.balconyView,
          imageData.nearestLandmark,
          imageData.developedAmenities,
          currentdate,
          Id,
        ];

        db.query(updateSQL, values, (err) => {
          if (err) {
            console.error("Update error:", err);
            return res
              .status(500)
              .json({ message: "Update failed", error: err });
          }

          res.status(200).json({ message: "Property updated successfully" });
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};

export const addImages = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.body.propertyid ? parseInt(req.body.propertyid) : null;

  if (!Id) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No images uploaded" });
    }

    /* ---------- UPLOAD TO S3 ---------- */
    const imageUrls = [];
    for (const file of files) {
      const s3Url = await uploadToS3(file);
      imageUrls.push(s3Url);
    }

    /* ---------- INSERT INTO DB ---------- */
    const insertSQL = `
      INSERT INTO propertiesimages 
      (propertyid, image, updated_at, created_at)
      VALUES ?
    `;

    const values = imageUrls.map((url) => [Id, url, currentdate, currentdate]);

    db.query(insertSQL, [values], (err) => {
      if (err) {
        console.error("Error inserting Images:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({
        message: "Images uploaded successfully",
        images: imageUrls,
      });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err });
  }
};

// ** New Additional Info Add API **
export const additionalInfoAdd = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyid,
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
  } = req.body;

  // Files check
  const owneradhar = req.files?.owneradhar
    ? req.files.owneradhar[0].filename
    : null;
  const ownerpan = req.files?.ownerpan ? req.files.ownerpan[0].filename : null;
  const schedule = req.files?.schedule ? req.files.schedule[0].filename : null;
  const signed = req.files?.signed ? req.files.signed[0].filename : null;
  const satbara = req.files?.satbara ? req.files.satbara[0].filename : null;
  const ebill = req.files?.ebill ? req.files.ebill[0].filename : null;

  const insertSQL = `
    INSERT INTO propertiesinfo 
    (propertyid, wing, floor, flatno, direction, ageofconstruction, carpetarea, superbuiltup, salesprice, description, ownercontact,
      owneradhar, ownerpan, schedule, signed, satbara, ebill, updated_at, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertSQL,
    [
      propertyid,
      wing,
      floor,
      flatno,
      direction,
      ageofconstruction,
      carpetarea,
      superbuiltup,
      salesprice,
      description,
      ownercontact,
      owneradhar,
      ownerpan,
      schedule,
      signed,
      satbara,
      ebill,
      currentdate,
      currentdate,
    ],
    (insertErr, insertResult) => {
      if (insertErr) {
        console.error("Error inserting:", insertErr);
        return res
          .status(500)
          .json({ message: "Database error", error: insertErr });
      }

      res.status(201).json({
        message: "Additional Info added successfully",
        Id: insertResult.insertId,
      });
    },
  );
};

// ** Additional Info Edit API **
export const editAdditionalInfo = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property Info ID" });
  }

  const {
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
  } = req.body;

  // Files check
  const owneradhar = req.files?.owneradhar
    ? req.files.owneradhar[0].filename
    : null;
  const ownerpan = req.files?.ownerpan ? req.files.ownerpan[0].filename : null;
  const schedule = req.files?.schedule ? req.files.schedule[0].filename : null;
  const signed = req.files?.signed ? req.files.signed[0].filename : null;
  const satbara = req.files?.satbara ? req.files.satbara[0].filename : null;
  const ebill = req.files?.ebill ? req.files.ebill[0].filename : null;

  // Start fields and values
  let updateFields = [
    "wing = ?",
    "floor = ?",
    "flatno = ?",
    "direction = ?",
    "ageofconstruction = ?",
    "carpetarea = ?",
    "superbuiltup = ?",
    "salesprice = ?",
    "description = ?",
    "ownercontact = ?",
    "updated_at = ?",
  ];

  const updateValues = [
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
    currentdate,
  ];

  // Dynamically add files if uploaded
  if (owneradhar) {
    updateFields.push("owneradhar = ?");
    updateValues.push(owneradhar);
  }
  if (ownerpan) {
    updateFields.push("ownerpan = ?");
    updateValues.push(ownerpan);
  }
  if (schedule) {
    updateFields.push("schedule = ?");
    updateValues.push(schedule);
  }
  if (signed) {
    updateFields.push("signed = ?");
    updateValues.push(signed);
  }
  if (satbara) {
    updateFields.push("satbara = ?");
    updateValues.push(satbara);
  }
  if (ebill) {
    updateFields.push("ebill = ?");
    updateValues.push(ebill);
  }

  const updateSQL = `UPDATE propertiesinfo SET ${updateFields.join(
    ", ",
  )} WHERE propertyinfoid = ?`;

  updateValues.push(Id);

  db.query(updateSQL, updateValues, (err, result) => {
    if (err) {
      console.error("Error updating:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.status(200).json({
      message: "Additional Info updated successfully",
      affectedRows: result.affectedRows,
    });
  });
};

export const deleteImages = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  // Step 1: fetch image URL from DB
  db.query(
    "SELECT image FROM propertiesimages WHERE imageid = ?",
    [Id],
    async (err, result) => {
      if (err) {
        console.error("Error fetching image:", err);
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      const imageUrl = result[0].image;

      try {
        // Step 2: delete image from S3 (if exists)
        if (imageUrl) {
          await deleteFromS3(imageUrl);
        }

        // Step 3: delete DB record
        db.query(
          "DELETE FROM propertiesimages WHERE imageid = ?",
          [Id],
          (deleteErr) => {
            if (deleteErr) {
              console.error("Error deleting image record:", deleteErr);
              return res.status(500).json({
                message: "Database error",
                error: deleteErr,
              });
            }

            return res
              .status(200)
              .json({ message: "Image deleted successfully" });
          },
        );
      } catch (s3Err) {
        console.error("S3 delete error:", s3Err);
        return res.status(500).json({
          message: "Failed to delete image from S3",
          error: s3Err,
        });
      }
    },
  );
};

export const propertyInfo = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Property ID" });

  const sql = "SELECT * FROM propertiesinfo WHERE propertyid = ?";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(201).json({ propertyid: Id });
    }
    res.json(result[0]);
  });
};
