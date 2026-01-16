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

    const { sub: googleId, email, name, picture, email_verified } = payload;

    if (!email_verified) {
      return res.status(403).json({
        success: false,
        message: "Email not verified by Google",
      });
    }

    const promiseDb = db.promise ? db.promise() : db;

    const [users] = await promiseDb.query(
      "SELECT * FROM guestUsers WHERE email = ? AND status = 'Active'",
      [email]
    );

    let userData;

    if (users.length > 0) {
      const user = users[0];

      if (user.auth_provider === "local" && !user.google_id) {
        return res.status(409).json({
          success: false,
          message:
            "This email is registered with password login. Please login using password.",
        });
      }

      if (!user.google_id) {
        await promiseDb.query(
          `UPDATE guestUsers 
           SET google_id = ?, auth_provider = 'google', is_email_verified = 1 
           WHERE id = ?`,
          [googleId, user.id]
        );
      }

      userData = {
        id: user.id,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
      };

    } else {
      const [result] = await promiseDb.query(
        `INSERT INTO guestUsers 
         (fullname, email, userimage, role, status, google_id, auth_provider, is_email_verified)
         VALUES (?, ?, ?, 'Guest User', 'Active', ?, 'google', 1)`,
        [name, email, picture, googleId]
      );

      userData = {
        id: result.insertId,
        fullname: name,
        email,
        role: "Guest User",
      };
    }

    /* JWT (MATCH OTP EXPIRY) */
    const jwtToken = jwt.sign(
      { id: userData.id, email: userData.email, role: userData.role },
      process.env.JWT_SECRET,
      { expiresIn: "10d" }
    );

    /* SESSION (CRITICAL) */
    req.session.user = userData;

    /* COOKIE (CRITICAL) */
    res.cookie("userToken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token: jwtToken,
      user: userData,
    });
  } catch (error) {
    console.error("Google login error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};
