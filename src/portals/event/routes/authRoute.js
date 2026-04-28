import express from "express";
import { sendUserOtp, verifyUserOtp } from "../controllers/authContoller.js";
import db from "#db";
const router = express.Router();

//Send OTP
router.post("/send-otp", sendUserOtp);

// Verify OTP
router.post("/verify-otp", verifyUserOtp);
// routes/user.js

router.delete("/delete-account", (req, res) => {
  const userId = req.user.id;

  const deleteUserQuery = "DELETE FROM eventUsers WHERE id = ?";

  db.query(deleteUserQuery, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Error deleting user",
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
      message: "Account deleted successfully",
    });
  });
});

export default router;
