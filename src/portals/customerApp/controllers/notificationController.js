import db from "#db";

const saveFcmToken = (req, res) => {
  const { fcmToken } = req.body;
  const userId = req.user?.id || req.body.userId;

  if (!fcmToken && !userId) {
    return res.status(400).json({
      success: false,
      message: "FCM token required",
    });
  }

  const sql = "UPDATE guestUsers SET fcmToken = ? WHERE id = ?";

  db.query(sql, [fcmToken, userId], (err, result) => {
    if (err) {
      console.log("Save FCM Error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    console.log("ok");
    res.status(200).json({
      success: true,
      message: "FCM token saved successfully",
    });
  });
};

export default saveFcmToken;
