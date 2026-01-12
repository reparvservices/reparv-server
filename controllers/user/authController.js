import jwt from "jsonwebtoken";
import db from "../../config/dbconnect.js";
import { verifyGoogleToken } from "../../utils/googleAuth.js";

export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    const payload = await verifyGoogleToken(token);

    const {
      sub: googleId,
      email,
      name,
      picture,
      email_verified,
    } = payload;

    if (!email_verified) {
      return res.status(403).json({
        success: false,
        message: "Email not verified by Google",
      });
    }

    // 🔑 FORCE PROMISE MODE
    const promiseDb = db.promise ? db.promise() : db;

    const [users] = await promiseDb.query(
      "SELECT id, google_id, auth_provider, role FROM users WHERE email = ?",
      [email]
    );

    let userId;
    let role = "user";

    if (users.length > 0) {
      const user = users[0];
      userId = user.id;
      role = user.role;

      if (user.auth_provider === "local" && !user.google_id) {
        return res.status(409).json({
          success: false,
          message:
            "This email is registered with password login. Please login using password.",
        });
      }

      if (!user.google_id) {
        await promiseDb.query(
          `UPDATE users 
           SET google_id = ?, auth_provider = 'google', is_email_verified = 1 
           WHERE id = ?`,
          [googleId, userId]
        );
      }
    } else {
      const [result] = await promiseDb.query(
        `INSERT INTO users 
         (name, email, userimage, role, status, google_id, auth_provider, is_email_verified)
         VALUES (?, ?, ?, 'user', 'Active', ?, 'google', 1)`,
        [name, email, picture, googleId]
      );

      userId = result.insertId;
    }

    const accessToken = jwt.sign(
      { id: userId, email, role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.json({
      success: true,
      accessToken,
    });
  } catch (error) {
    console.error("Google login error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};
