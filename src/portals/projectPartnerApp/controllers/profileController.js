// ─── controllers/projectPartnerApp/profileController.js ─────

import db from "#db";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
import { uploadToS3 } from "#utils/imageUpload.js";

// ── Helper: upload one file field to S3 ─────────────────────
const uploadImageField = async (fileObj) => {
  if (!fileObj) return null;
  try {
    let uploadFile = fileObj;
    if (fileObj.mimetype?.startsWith("image/")) {
      const compressed = await convertSingleImageToWebp(fileObj);
      if (compressed) uploadFile = compressed;
    }
    const url = await uploadToS3(uploadFile);
    return url;
  } catch (err) {
    console.error("S3 upload error:", err);
    return null;
  }
};

// ── GET profile header ───────────────────────────────────────
// GET /project-partner/profile/header
export const getProfileHeader = (req, res) => {
  const { userId } = req.body;
  if (!userId)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const sql = `
    SELECT id, fullname, username, email, contact, whatsappNumber,
           userimage, coverImage, role, city, state, address,
           experience, businessAddress, businessCity, businessState
    FROM projectpartner
    WHERE id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("GET HEADER ERROR:", err);
      return res.status(500).json({ success: false, message: "Fetch failed" });
    }
    if (!results.length)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    return res.status(200).json({ success: true, data: results[0] });
  });
};

// ── UPDATE profile header ────────────────────────────────────
// PUT /project-partner/profile/header

export const updateProfileHeader = async (req, res) => {
  const { userId } = req.body;
  console.log(req.body);

  if (!userId)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const {
    fullname,
    username,
    whatsappNumber,
    experience,
    role_headline,
    bio,
    status,
    // ── basic info fields ──
    companyName,
    location,
    website,
    territories,
    // ── linked / social URLs ──
    linkedinUrl,
    instagramUrl,
    facebookUrl,
    twitterUrl,
    youtubeUrl,
    telegramUrl,
    //business Category
    categories,

    //privacy
    pref_showPosts,
    pref_autoPublish,
    pref_allowTagging,
    pref_allowReposts,
    pref_enableStories,
  } = req.body;

  const fields = [];
  const values = [];

  if (fullname !== undefined) {
    fields.push("fullname = ?");
    values.push(fullname);
  }
  if (username !== undefined) {
    fields.push("username = ?");
    values.push(username);
  }
  if (whatsappNumber !== undefined) {
    fields.push("whatsappNumber = ?");
    values.push(whatsappNumber);
  }
  if (experience !== undefined) {
    fields.push("experience = ?");
    values.push(experience);
  }
  if (role_headline !== undefined) {
    fields.push("displayRole = ?");
    values.push(role_headline);
  }
  if (bio !== undefined) {
    fields.push("bio = ?");
    values.push(bio);
  }
  if (status !== undefined) {
    const normalizedStatus =
      status.trim().toLowerCase() === "active" ? "Active" : "Inactive";
    fields.push("status = ?");
    values.push(normalizedStatus);
  }
  if (companyName !== undefined) {
    fields.push("companyName = ?");
    values.push(companyName);
  }
  if (location !== undefined) {
    fields.push("location = ?");
    values.push(location);
  }
  if (website !== undefined) {
    fields.push("website = ?");
    values.push(website);
  }
  if (territories !== undefined) {
    fields.push("territories = ?");
    values.push(territories);
  }
  // ── linked / social URLs (only pushed if provided) ───────
  if (linkedinUrl !== undefined) {
    fields.push("linkedinUrl = ?");
    values.push(linkedinUrl);
  }
  if (instagramUrl !== undefined) {
    fields.push("instagramUrl = ?");
    values.push(instagramUrl);
  }
  if (facebookUrl !== undefined) {
    fields.push("facebookUrl = ?");
    values.push(facebookUrl);
  }
  if (twitterUrl !== undefined) {
    fields.push("twitterUrl = ?");
    values.push(twitterUrl);
  }
  if (youtubeUrl !== undefined) {
    fields.push("youtubeUrl = ?");
    values.push(youtubeUrl);
  }
  if (telegramUrl !== undefined) {
    fields.push("telegramUrl = ?");
    values.push(telegramUrl);
  }

  //privacy
  if (pref_showPosts !== undefined) {
    fields.push("pref_showPosts = ?");
    values.push(pref_showPosts);
  }
  if (pref_autoPublish !== undefined) {
    fields.push("pref_autoPublish = ?");
    values.push(pref_autoPublish);
  }
  if (pref_allowTagging !== undefined) {
    fields.push("pref_allowTagging = ?");
    values.push(pref_allowTagging);
  }
  if (pref_allowReposts !== undefined) {
    fields.push("pref_allowReposts = ?");
    values.push(pref_allowReposts);
  }
  if (pref_enableStories !== undefined) {
    fields.push("pref_enableStories = ?");
    values.push(pref_enableStories);
  }

  // ── Upload images to S3 if provided ─────────────────────
  const userimageFile = req.files?.userimage?.[0];
  const coverImageFile = req.files?.coverImage?.[0];

  const [userimageUrl, coverImageUrl] = await Promise.all([
    uploadImageField(userimageFile),
    uploadImageField(coverImageFile),
  ]);

  if (userimageUrl) {
    fields.push("userimage = ?");
    values.push(userimageUrl);
  }
  if (coverImageUrl) {
    fields.push("coverImage = ?");
    values.push(coverImageUrl);
  }

  if (categories !== undefined) {
    fields.push("BusinessCategories = ?");
    values.push(categories);
  }
  if (fields.length === 0)
    return res
      .status(400)
      .json({ success: false, message: "No fields to update" });

  fields.push("updated_at = NOW()");
  values.push(userId);

  const sql = `UPDATE projectpartner SET ${fields.join(", ")} WHERE id = ?`;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("UPDATE HEADER ERROR:", err);
      return res.status(500).json({ success: false, message: "Update failed" });
    }
    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    return res.status(200).json({
      success: true,
      message: "Profile header updated successfully",
      ...(userimageUrl && { userimage: userimageUrl }),
      ...(coverImageUrl && { coverImage: coverImageUrl }),
    });
  });
};

export const deactivateUser = (req, res) => {
  try {
    const { user_id, role } = req.body;

    console.log("Deactivate Request:", req.body);

    if (!user_id || !role) {
      return res.status(400).json({
        success: false,
        message: "user_id and role are required",
      });
    }

    // ✅ Table + ID column mapping
    const roleConfig = {
      "Project Partner": {
        table: "projectpartner",
        idColumn: "id",
      },
      "Sales Person": {
        table: "salespersons",
        idColumn: "salespersonsid",
      },
      "Territory Partner": {
        table: "territorypartner",
        idColumn: "id",
      },
    };

    const config = roleConfig[role];

    if (!config) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    const { table, idColumn } = config;

    const query = `
      UPDATE ${table}
      SET loginstatus = 'Inactive',
          status = 'Inactive'
      WHERE ${idColumn} = ?
    `;

    console.log("Table:", table);
    console.log("ID Column:", idColumn);

    db.query(query, [user_id], (err, result) => {
      if (err) {
        console.error("Deactivate User Error:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "User deactivated successfully",
      });
    });
  } catch (error) {
    console.error("Deactivate User Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
