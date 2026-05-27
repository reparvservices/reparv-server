import moment from "moment-timezone";
import db from "#db";
import fs from "fs";
import path from "path";
import { uploadToS3 } from "#utils/imageUpload.js";
import { convertImagesToWebp } from "#utils/convertImagesToWebp.js";
import { uploadVideoToS3 } from "#utils/videoUpload.js";
import { sanitize } from "#utils/sanitize.js";
function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}

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
  const partnerId = req.params.id;

  if (!partnerId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }
  const sql = `SELECT * from properties WHERE properties.projectpartnerid = ? 
               ORDER BY properties.propertyid DESC`;
  db.query(sql, [partnerId], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
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

export const addProperty = async (req, res) => {
  try {
    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      projectpartnerid,
      propertyVideo,
    } = req.body;

    /* ---------------- CHECK DUPLICATE NAME ---------------- */
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      async (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ success: false, message: "Database error" });
        }

        if (result.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Property name already exists",
          });
        }

        /* ---------------- PARSE AREAS ---------------- */
        let parsedAreas = [];

        try {
          if (typeof areas === "string") {
            parsedAreas = JSON.parse(areas);
          } else if (Array.isArray(areas)) {
            parsedAreas = areas;
          }
        } catch (e) {
          parsedAreas = [];
        }

        const builtUpArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("built-up"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("carpet"))
            ?.value || null;

        /* ---------------- IMAGE UPLOAD ---------------- */
        const uploadField = async (field) => {
          if (!req.files || !req.files[field]) return [];

          const converted = await convertImagesToWebp({
            [field]: req.files[field],
          });

          const urls = [];
          for (const file of converted[field]) {
            const url = await uploadToS3(file);
            urls.push(url);
          }

          return urls;
        };

        /* ---------------- PROCESS IMAGES ---------------- */
        const frontView = await uploadField("frontView");
        const sideView = await uploadField("sideView");
        const kitchenView = await uploadField("kitchenView");
        const hallView = await uploadField("hallView");
        const bedroomView = await uploadField("bedroomView");
        const bathroomView = await uploadField("bathroomView");
        const balconyView = await uploadField("balconyView");
        const nearestLandmark = await uploadField("nearestLandmark");
        const developedAmenities = await uploadField("developedAmenities");

        /* ---------------- INSERT QUERY ---------------- */
        const seoSlug = toSlug(property_name);

        const insertSQL = `
  INSERT INTO properties (
    projectpartnerid, propertyType, propertyCategory, propertyName,
    totalSalesPrice, totalOfferPrice, contact, projectBy,
    state, city, address, builtUpArea, carpetArea,
    frontView, sideView, kitchenView, hallView,
    bedroomView, bathroomView, balconyView,
    nearestLandmark, developedAmenities,
    propertyVideo,
    seoSlug, created_at, updated_at
  )
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
`;

        const values = [
          projectpartnerid,
          property_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          builtUpArea,
          carpetArea,
          JSON.stringify(frontView),
          JSON.stringify(sideView),
          JSON.stringify(kitchenView),
          JSON.stringify(hallView),
          JSON.stringify(bedroomView),
          JSON.stringify(bathroomView),
          JSON.stringify(balconyView),
          JSON.stringify(nearestLandmark),
          JSON.stringify(developedAmenities),
          propertyVideo,
          seoSlug,
        ];

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            console.error("INSERT ERROR:", err);
            return res
              .status(500)
              .json({ success: false, message: "Insert failed" });
          }

          return res.status(201).json({
            success: true,
            message: "Property added successfully",
            id: result.insertId,
          });
        });
      },
    );
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update property controller
export const update = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.params.id;

  console.log("Received update request for property ID:", Id);
  if (!Id) {
    return res.status(400).json({ message: "Invalid property ID" });
  }
  const files = await convertImagesToWebp(req.files);

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
    registrationFee,
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
    propertyVideo,
  } = req.body;

  console.log("Update payload:", req.body);
  // Validation
  if (!propertyCategory) {
    console.log("propertyCategory is missing");
    return res.status(400).json({ message: "Property Category is required" });
  }

  if (!propertyName) {
    console.log("propertyName is missing");
    return res.status(400).json({ message: "Property Name is required" });
  }

  if (!address) {
    console.log("address is missing");
    return res.status(400).json({ message: "Address is required" });
  }

  if (!state) {
    console.log("state is missing");
    return res.status(400).json({ message: "State is required" });
  }

  if (!city) {
    console.log("city is missing");
    return res.status(400).json({ message: "City is required" });
  }

  if (!pincode) {
    console.log("pincode is missing");
    return res.status(400).json({ message: "Pincode is required" });
  }

  if (!location) {
    console.log("location is missing");
    return res.status(400).json({ message: "Location is required" });
  }

  if (!totalSalesPrice) {
    console.log("totalSalesPrice is missing");
    return res.status(400).json({ message: "Total Sales Price is required" });
  }

  if (!totalOfferPrice) {
    console.log("totalOfferPrice is missing");
    return res.status(400).json({ message: "Total Offer Price is required" });
  }

  if (!ownershipType) {
    console.log("ownershipType is missing");
    return res.status(400).json({ message: "Ownership Type is required" });
  }

  if (!carpetArea) {
    console.log("carpetArea is missing");
    return res.status(400).json({ message: "Carpet Area is required" });
  }

  // Property Registration Fee calculation
  let registrationFees;
  if (totalOfferPrice > 3000000) {
    registrationFees = (30000 / totalOfferPrice) * 100;
  } else {
    registrationFees = ["RentalFlat", "RentalShop", "RentalOffice"].includes(
      propertyCategory,
    )
      ? 0
      : 1;
  }

  const emi = calculateEMI(Number(totalOfferPrice));

  let formattedPossessionDate = null;
  if (possessionDate && possessionDate.trim() !== "") {
    if (
      moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
    ) {
      formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
    }
  }

  const propertyTypeArray = Array.isArray(propertyType)
    ? propertyType
    : typeof propertyType === "string"
      ? propertyType
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  const propertyTypeJson = JSON.stringify(propertyTypeArray);

  // Fetch existing property
  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    async (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0)
        return res.status(404).json({ message: "Property not found" });

      const existing = result[0];

      // Function to upload new images to S3 or keep existing
      const getImagePaths = async (field) => {
        if (files[field]) {
          const uploadedUrls = [];
          for (const file of files[field]) {
            const url = await uploadToS3(file);
            uploadedUrls.push(url);
          }
          return JSON.stringify(uploadedUrls);
        } else {
          return existing[field]; // keep old images
        }
      };

      try {
        const frontView = await getImagePaths("frontView");
        const sideView = await getImagePaths("sideView");
        const kitchenView = await getImagePaths("kitchenView");
        const hallView = await getImagePaths("hallView");
        const bedroomView = await getImagePaths("bedroomView");
        const bathroomView = await getImagePaths("bathroomView");
        const balconyView = await getImagePaths("balconyView");
        const nearestLandmark = await getImagePaths("nearestLandmark");
        const developedAmenities = await getImagePaths("developedAmenities");

        const updateSQL = `
        UPDATE properties SET 
          builderid=?, projectBy=?, possessionDate=?, propertyCategory=?, propertyApprovedBy=?, propertyName=?, address=?, state=?, city=?, pincode=?, location=?,
          distanceFromCityCenter=?, latitude=?, longitude=?, totalSalesPrice=?, totalOfferPrice=?, emi=?, stampDuty=?, registrationFee=?, gst=?, advocateFee=?, 
          msebWater=?, maintenance=?, other=?, tags=?, propertyType=?, builtYear=?, ownershipType=?,
          builtUpArea=?, carpetArea=?, parkingAvailability=?, totalFloors=?, floorNo=?, loanAvailability=?,
          propertyFacing=?, reraRegistered=?, furnishing=?, waterSupply=?, powerBackup=?, locationFeature=?, sizeAreaFeature=?, parkingFeature=?, terraceFeature=?,
          ageOfPropertyFeature=?, amenitiesFeature=?, propertyStatusFeature=?, smartHomeFeature=?,
          securityBenefit=?, primeLocationBenefit=?, rentalIncomeBenefit=?, qualityBenefit=?, capitalAppreciationBenefit=?, ecofriendlyBenefit=?,
          frontView=?, sideView=?, kitchenView=?, hallView=?, bedroomView=?, bathroomView=?, balconyView=?,
          nearestLandmark=?, developedAmenities=?, propertyVideo=?, updated_at=?
        WHERE propertyid = ?
      `;

        const values = [
          builderid,
          sanitize(projectBy),
          sanitize(formattedPossessionDate),
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
          frontView,
          sideView,
          kitchenView,
          hallView,
          bedroomView,
          bathroomView,
          balconyView,
          nearestLandmark,
          developedAmenities,
          propertyVideo, // added here
          currentdate,
          Id,
        ];

        db.query(updateSQL, values, (err) => {
          if (err) {
            console.error("Error updating property:", err);
            return res
              .status(500)
              .json({ message: "Update failed", error: err });
          }
          console.log(values);

          res.status(200).json({ message: "Property updated successfully" });
        });
      } catch (s3Err) {
        console.error("S3 upload error:", s3Err);
        return res
          .status(500)
          .json({ message: "Image/Video upload failed", error: s3Err });
      }
    },
  );
};

export const addPropertyNew = async (req, res) => {
  try {
    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      pincode,
      latitude,
      longitude,
      projectpartnerid,
      propertyVideo,

      frontView,
      sideView,
      kitchenView,
      hallView,
      bedroomView,
      bathroomView,
      balconyView,
      nearestLandmark,
      developedAmenities,
      extraImages,
    } = req.body;
    console.log(req.body);

    if (!projectpartnerid) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    const missing = [];

    if (!property_name) missing.push("Property Name");
    if (!property_type) missing.push("Property Type");
    if (!price) missing.push("Price");
    if (!state) missing.push("State");
    if (!city) missing.push("City");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    /* ---------- DUPLICATE CHECK ---------- */

    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      (err, result) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        if (result.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Property name already exists",
          });
        }

        /* ---------- AREA PARSE ---------- */

        let parsedAreas = [];

        try {
          parsedAreas =
            typeof areas === "string" ? JSON.parse(areas) : areas || [];
        } catch {
          parsedAreas = [];
        }

        const builtUpArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("built"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("carpet"))
            ?.value || null;

        const seoSlug = toSlug(property_name);

        const insertSQL = `
        INSERT INTO properties (
          projectpartnerid,
          propertyType,
          propertyCategory,
          propertyName,
          totalSalesPrice,
          totalOfferPrice,
          contact,
          projectBy,
          state,
          city,
          address,
          pincode,
          latitude,
          longitude,
          builtUpArea,
          carpetArea,
          frontView,
          sideView,
          kitchenView,
          hallView,
          bedroomView,
          bathroomView,
          balconyView,
          nearestLandmark,
          developedAmenities,
          extraImages,
          propertyVideo,
          seoSlug,
          created_at,
          updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
        `;

        const values = [
          projectpartnerid,
          property_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          pincode,
          latitude,
          longitude,
          builtUpArea,
          carpetArea,
          JSON.stringify(frontView || []),
          JSON.stringify(sideView || []),
          JSON.stringify(kitchenView || []),
          JSON.stringify(hallView || []),
          JSON.stringify(bedroomView || []),
          JSON.stringify(bathroomView || []),
          JSON.stringify(balconyView || []),
          JSON.stringify(nearestLandmark || []),
          JSON.stringify(developedAmenities || []),
          JSON.stringify(extraImages || []),
          propertyVideo,
          seoSlug,
        ];

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: "Insert failed",
            });
          }

          const newPropertyId = result.insertId;

          /* ---------- GENERATE propertyCityId ---------- */
          db.query(
            "SELECT cityNACL FROM cities WHERE city = ? LIMIT 1",
            [city],
            (err2, cityResult) => {
              if (err2)
                return res.status(500).json({
                  success: false,
                  message: "City lookup failed",
                  error: err2,
                });

              if (cityResult.length === 0)
                return res.status(404).json({
                  success: false,
                  message: "City not found in database",
                });

              const cityNACL = cityResult[0].cityNACL;
              const propertyCityId = `${cityNACL}-${newPropertyId}`;

              db.query(
                "UPDATE properties SET propertyCityId = ? WHERE propertyid = ?",
                [propertyCityId, newPropertyId],
                (err3) => {
                  if (err3)
                    return res.status(500).json({
                      success: false,
                      message: "Failed to update propertyCityId",
                      error: err3,
                    });

                  return res.status(201).json({
                    success: true,
                    message: "Property created successfully",
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
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateProperty = async (req, res) => {
  const { propertyid } = req.params;
  try {
    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      pincode,
      latitude,
      longitude,
      projectpartnerid,
      propertyVideo,

      frontView,
      sideView,
      kitchenView,
      hallView,
      bedroomView,
      bathroomView,
      balconyView,
      nearestLandmark,
      developedAmenities,
      extraImages,
    } = req.body;

    console.log(req.body);

    /* ---------- AUTH CHECK ---------- */

    if (!projectpartnerid) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    /* ---------- REQUIRED FIELD CHECK ---------- */

    if (!propertyid) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required",
      });
    }

    const missing = [];

    if (!property_name) missing.push("Property Name");
    if (!property_type) missing.push("Property Type");
    if (!price) missing.push("Price");
    if (!state) missing.push("State");
    if (!city) missing.push("City");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    /* ---------- OWNERSHIP CHECK ---------- */

    db.query(
      "SELECT propertyid, projectpartnerid, propertyName FROM properties WHERE propertyid = ?",
      [propertyid],
      (err, result) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        if (result.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Property not found",
          });
        }

        const existing = result[0];

        if (String(existing.projectpartnerid) !== String(projectpartnerid)) {
          return res.status(403).json({
            success: false,
            message: "Unauthorized to update this property",
          });
        }

        /* ---------- AREA PARSE ---------- */

        let parsedAreas = [];

        try {
          parsedAreas =
            typeof areas === "string" ? JSON.parse(areas) : areas || [];
        } catch {
          parsedAreas = [];
        }

        const builtUpArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("built"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("carpet"))
            ?.value || null;

        /* ---------- SEO SLUG ---------- */

        // Only regenerate slug if name changed
        const seoSlug =
          existing.propertyName !== property_name
            ? toSlug(property_name)
            : undefined;

        /* ---------- BUILD UPDATE QUERY ---------- */

        const updateSQL = `
          UPDATE properties SET
            propertyType        = ?,
            propertyCategory    = ?,
            propertyName        = ?,
            totalSalesPrice     = ?,
            totalOfferPrice     = ?,
            contact             = ?,
            projectBy           = ?,
            state               = ?,
            city                = ?,
            address             = ?,
            pincode             = ?,
            latitude            = ?,
            longitude           = ?,
            builtUpArea         = ?,
            carpetArea          = ?,
            frontView           = ?,
            sideView            = ?,
            kitchenView         = ?,
            hallView            = ?,
            bedroomView         = ?,
            bathroomView        = ?,
            balconyView         = ?,
            nearestLandmark     = ?,
            developedAmenities  = ?,
            extraImages         = ?,
            propertyVideo       = ?
            ${seoSlug ? ", seoSlug = ?" : ""}
            , updated_at        = NOW()
          WHERE propertyid = ?
            AND projectpartnerid = ?
        `;

        const values = [
          property_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
          pincode,
          latitude,
          longitude,
          builtUpArea,
          carpetArea,
          JSON.stringify(frontView || []),
          JSON.stringify(sideView || []),
          JSON.stringify(kitchenView || []),
          JSON.stringify(hallView || []),
          JSON.stringify(bedroomView || []),
          JSON.stringify(bathroomView || []),
          JSON.stringify(balconyView || []),
          JSON.stringify(nearestLandmark || []),
          JSON.stringify(developedAmenities || []),
          JSON.stringify(extraImages || []),
          propertyVideo,
          ...(seoSlug ? [seoSlug] : []),
          propertyid,
          projectpartnerid,
        ];

        db.query(updateSQL, values, (err, result) => {
          if (err) {
            console.error("Update error:", err);
            return res.status(500).json({
              success: false,
              message: "Update failed",
            });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({
              success: false,
              message: "Property not found or no changes made",
            });
          }

          res.status(200).json({
            success: true,
            message: "Property updated successfully",
            id: propertyid,
            ...(seoSlug ? { seoSlug } : {}),
          });
        });
      },
    );
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
