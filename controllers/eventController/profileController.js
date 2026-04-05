import db from "../../config/dbconnect.js";

export const getUserProfile = (req, res) => {
  const userId = req.params.id;
  const query = "SELECT * FROM eventUsers WHERE id = ?";
  db.query(query, [userId], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: result[0],
    });
  });
};
