import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";
import { convertSingleImageToWebp } from "../../utils/convertSingleImageToWebp.js";

const saltRounds = 10;

export const getProfile = (req, res) => {
  const Id = req.salesUser?.id;
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `
    SELECT 
      sp.*, 
      pp.fullname AS projectpartnerfullname,
      pp.contact AS projectpartnercontact,
      pp.city AS projectpartnercity
    FROM salespersons sp
    LEFT JOIN projectpartner pp ON sp.projectpartnerid = pp.id
    WHERE sp.salespersonsid = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching profile:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(result[0]);
  });
};

export const editProfile = async (req, res) => {
  const userId = req.salesUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { fullname, username, contact, email } = req.body;

  if (!fullname || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // 1 Fetch existing user image
    const result = await new Promise((resolve, reject) => {
      db.query(
        "SELECT userimage FROM salespersons WHERE salespersonsid = ?",
        [userId],
        (err, rows) => (err ? reject(err) : resolve(rows)),
      );
    });

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingImage = result[0].userimage;
    let finalImagePath = existingImage;

    // 2 Compress + Upload new image if provided
    if (req.file) {
      // Convert to webp
      const convertedImage = await convertSingleImageToWebp(req.file);

      // Upload compressed image to S3
      finalImagePath = await uploadToS3(convertedImage);

      // Delete old image from S3
      if (existingImage) {
        try {
          await deleteFromS3(existingImage);
        } catch (deleteErr) {
          console.error("Failed to delete old image:", deleteErr);
        }
      }
    }

    // 3 Update profile
    const updateSql = `
      UPDATE salespersons 
      SET fullname = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ?
      WHERE salespersonsid = ?
    `;

    const updateValues = [
      fullname,
      username,
      contact,
      email,
      finalImagePath,
      currentdate,
      userId,
    ];

    await new Promise((resolve, reject) => {
      db.query(updateSql, updateValues, (err) =>
        err ? reject(err) : resolve(),
      );
    });

    return res.status(200).json({
      message: "Profile updated successfully",
      userimage: finalImagePath,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

export const v2EditProfile = async (req, res) => {
  const userId = req.salesUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    fullname,
    username,
    contact,
    email,
    companyName,
    role,
    location,
    bio,
    website,
    territories,
    BusinessCategories,
    instagramUrl,
    linkedinUrl,
    youtubeUrl,
    whatsappNumber,

    // preferences
    pref_showPosts,
    pref_allowTagging,
    pref_allowReposts,
    pref_enableStories,
    pref_autoPublish,
  } = req.body;

  if (!fullname || !username || !contact || !email) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // 👉 Fetch existing data
  db.query(
    "SELECT userimage, coverImage FROM projectpartner WHERE id = ?",
    [userId],
    async (err, result) => {
      if (err) {
        console.error("Fetch error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      let finalImagePath = result[0].userimage;
      let finalCoverPath = result[0].coverImage;

      try {
        // =========================
        //  PROFILE IMAGE
        // =========================
        if (req.files?.image) {
          let file = req.files.image[0];

          if (file.mimetype?.startsWith("image/")) {
            const compressed = await convertSingleImageToWebp(file);
            if (compressed) file = compressed;
          }

          const newUrl = await uploadToS3(file);

          // OPTIONAL: delete old image
          if (finalImagePath) {
            await deleteFromS3(finalImagePath);
          }

          finalImagePath = newUrl;
        }

        // =========================
        // COVER IMAGE
        // =========================
        if (req.files?.coverImage) {
          let file = req.files.coverImage[0];

          if (file.mimetype?.startsWith("image/")) {
            const compressed = await convertSingleImageToWebp(file);
            if (compressed) file = compressed;
          }

          const newUrl = await uploadToS3(file);

          if (finalCoverPath) {
            await deleteFromS3(finalCoverPath);
          }

          finalCoverPath = newUrl;
        }
      } catch (uploadErr) {
        console.error("S3 Error:", uploadErr);
        return res.status(500).json({
          message: "Image upload failed",
          error: uploadErr,
        });
      }

      // =========================
      // UPDATE QUERY
      // =========================

      const safePref = (val) => (val === "1" || val === 1 ? 1 : 0);

      const prefData = {
        pref_showPosts: safePref(pref_showPosts),
        pref_allowTagging: safePref(pref_allowTagging),
        pref_allowReposts: safePref(pref_allowReposts),
        pref_enableStories: safePref(pref_enableStories),
        pref_autoPublish: safePref(pref_autoPublish),
      };

      const updateSql = `
        UPDATE projectpartner SET
          fullname = ?,
          username = ?,
          contact = ?,
          email = ?,
          companyName = ?,
          role = ?,
          location = ?,
          bio = ?,
          website = ?,
          territories = ?,
          BusinessCategories = ?,
          instagramUrl = ?,
          linkedinUrl = ?,
          youtubeUrl = ?,
          whatsappNumber = ?,
          pref_showPosts = ?,
          pref_allowTagging = ?,
          pref_allowReposts = ?,
          pref_enableStories = ?,
          pref_autoPublish = ?,
          userimage = ?,
          coverImage = ?,
          updated_at = ?
        WHERE id = ?
      `;

      const values = [
        fullname,
        username,
        contact,
        email,
        companyName || null,
        role || null,
        location || null,
        bio || null,
        website || null,
        territories || null, // already JSON string
        BusinessCategories || null, // already JSON string
        instagramUrl || null,
        linkedinUrl || null,
        youtubeUrl || null,
        whatsappNumber || null,
        prefData.pref_showPosts,
        prefData.pref_allowTagging,
        prefData.pref_allowReposts,
        prefData.pref_enableStories,
        prefData.pref_autoPublish,
        finalImagePath,
        finalCoverPath,
        currentdate,
        userId,
      ];

      db.query(updateSql, values, (updateErr) => {
        if (updateErr) {
          console.error("Update error:", updateErr);
          return res.status(500).json({
            message: "Database update failed",
            error: updateErr,
          });
        }

        res.status(200).json({
          message: "Profile updated successfully",
          userimage: finalImagePath,
          coverImage: finalCoverPath,
        });
      });
    },
  );
};

export const changePassword = async (req, res) => {
  const userId = req.salesUser?.id;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Both current and new passwords are required" });
  }
  if (currentPassword === newPassword) {
    return res
      .status(400)
      .json({ message: "New Password Cannot be Same as Current Password" });
  }

  try {
    // Fetch user's current password from the database
    db.query(
      "SELECT password FROM salespersons WHERE salespersonsid = ?",
      [userId],
      async (err, result) => {
        if (err) {
          console.error("Error fetching user:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const storedPassword = result[0].password;

        // Compare provided current password with stored password
        const isMatch = await bcrypt.compare(currentPassword, storedPassword);
        if (!isMatch) {
          return res
            .status(400)
            .json({ message: "Current password is incorrect" });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password in the database
        db.query(
          "UPDATE salespersons SET password = ? WHERE salespersonsid = ?",
          [hashedPassword, userId],
          (updateErr) => {
            if (updateErr) {
              console.error("Error updating password:", updateErr);
              return res.status(500).json({
                message: "Database error during update",
                error: updateErr,
              });
            }

            res.status(200).json({ message: "Password changed successfully" });
          },
        );
      },
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const updateOneSignalId = async (req, res) => {
  const { onesignalId } = req.body;

  const id = req.salesUser?.id;
  if (!onesignalId) {
    return res
      .status(400)
      .json({ success: false, message: "onesignalId is required" });
  }
  try {
    const query = `UPDATE salespersons SET onesignalid = ? WHERE salespersonsid = ?`;
    db.query(query, [onesignalId, id], (err, result) => {
      if (err) {
        console.error("OneSignal update error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error" });
      }

      if (result.affectedRows === 0) {
        console.log("not");

        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }
      console.log("suucess");

      return res.json({
        success: true,
        message: "OneSignal ID stored successfully",
        onesignalId,
      });
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const updateProjectPartner = async (req, res) => {
  try {
    const userId = req.salesUser?.id;
    const { projectpartnerid } = req.body;

    if (!projectpartnerid) {
      res
        .status(500)
        .json({ success: false, message: "Project Partner Required !" });
    }
    db.query(
      "UPDATE salespersons SET projectpartnerid = ? WHERE salespersonsid = ?",
      [projectpartnerid, userId],
      (updateErr) => {
        if (updateErr) {
          console.error("Error updating Project Partner:", updateErr);
          return res.status(500).json({
            message: "Database error during update",
            error: updateErr,
          });
        }

        res
          .status(200)
          .json({ message: "Project Partner Updated Successfully " });
      },
    );
  } catch (error) {
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const changeProjectPartnerRequestSend = async (req, res) => {
  try {
    const userId = req.salesUser?.id;
    const projectPartnerId = req.salesUser?.projectpartnerid;
    if (!projectPartnerId) {
      res
        .status(500)
        .json({ success: false, message: "Project Partner Linked Required !" });
    }

    const { changePartnerReason } = req.body;
    if (!changePartnerReason) {
      res.status(401).json({ success: false, message: "Reason is Required!" });
    }
    db.query(
      "UPDATE salespersons SET changeProjectPartnerReason = ? WHERE salespersonsid = ?",
      [changePartnerReason, userId],
      (updateErr) => {
        if (updateErr) {
          console.error("Error updating Project Partner:", updateErr);
          return res.status(500).json({
            message: "Database error during update",
            error: updateErr,
          });
        }

        res.status(200).json({
          message: "Project Partner changed Request Send Successfully ",
        });
      },
    );
  } catch (error) {
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
