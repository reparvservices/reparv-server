import express from "express";
// import { getAll } from "../controllers/territorypartnerController.js";
import db from "#db";
import { getAll } from "../controllers/UsersController.js";
const router = express.Router();

router.get("/", getAll);
router.post("/follow", (req, res) => {
  const { follower_id, following_id } = req.body;
  console.log(follower_id, "f", following_id);

  if (!follower_id || !following_id) {
    return res.status(400).json({ error: "Missing follower or following ID" });
  }

  db.query(
    "SELECT * FROM territoryFollowers WHERE follower_id = ? AND following_id = ?",
    [follower_id, following_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });

      if (rows.length > 0) {
        return res
          .status(409)
          .json({ message: "Already following this salesperson" });
      }

      db.query(
        "INSERT INTO territoryFollowers (follower_id, following_id, created_at) VALUES (?, ?, NOW())",
        [follower_id, following_id],
        (insertErr) => {
          if (insertErr)
            return res.status(500).json({ error: "Insert failed" });
          res.json({ status: "Followed successfully" });
        },
      );
    },
  );
});

router.post("/unfollow", (req, res) => {
  const { follower_id, following_id } = req.body;
  console.log(follower_id, "unfollowing", following_id);

  if (!follower_id || !following_id) {
    return res.status(400).json({ error: "Missing follower or following ID" });
  }

  db.query(
    "DELETE FROM territoryFollowers WHERE follower_id = ? AND following_id = ?",
    [follower_id, following_id],
    (err, result) => {
      if (err) {
        console.error("Unfollow error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Not following this user" });
      }

      res.status(200).json({ status: "Unfollowed successfully" });
    },
  );
});

// GET /api/:id/followers
router.get("/:id/followers", (req, res) => {
  const id = req.params.id;
  // console.log(id,'ddd');

  db.query(
    `
    SELECT s.id, s.fullname, s.userimage
    FROM territoryFollowers f
    JOIN territorypartner s ON s.id = f.follower_id
    WHERE f.following_id = ?
  `,
    [id],
    (err, result) => {
      if (err) {
        console.error("Error fetching followers:", err);
        return res.status(500).json({ error: "Internal server error" });
      }

      res.json(result);
    },
  );
});

// GET /api/:id/following
router.get("/:id/following", async (req, res) => {
  const id = req.params.id;
  //   console.log(id,'ddffd');
  db.query(
    `
    SELECT s.id, s.fullname, s.userimage
    FROM territoryFollowers f
    JOIN territorypartner s ON s.id = f.following_id
    WHERE f.follower_id = ?`,
    [id],
    (err, result) => {
      if (err) {
        console.error("Error fetching followers:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      console.log(result);

      res.json(result);
    },
  );
});

router.get("/:id/following-posts", (req, res) => {
  const userId = req.params.id;
  console.log(userId, "xx");

  const query = `
    SELECT
      p.postId,
      p.userId,
      p.postContent,
      p.image,
      p.likes,
      p.created_at,
      u.fullname,
      u.city,
      u.userimage
    FROM 
      territorypartnerposts p
    JOIN 
      territoryFollowers f ON f.following_id = p.userId
    LEFT JOIN 
      territorypartner u ON p.userId = u.territorypartnerid
    WHERE 
      f.follower_id = ?
    ORDER BY 
      p.created_at DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching territory following posts:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json(results);
  });
});

//new onw

router.post("/add/follow", (req, res) => {
  const { follower_id, follower_type, following_id, following_type } = req.body;

  if (!follower_id || !following_id || !follower_type || !following_type) {
    return res.status(400).json({ error: "Missing follow data" });
  }

  const sql = `
    INSERT INTO userFollowers (follower_id, follower_type, following_id, following_type)
    VALUES (?, ?, ?, ?)
  `;

  db.query(
    sql,
    [follower_id, follower_type, following_id, following_type],
    (err) => {
      if (err) {
        console.error("Follow error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ status: "Followed successfully" });
    },
  );
});

router.post("/add/unfollow", (req, res) => {
  const { follower_id, follower_type, following_id, following_type } = req.body;

  if (!follower_id || !following_id || !follower_type || !following_type) {
    return res.status(400).json({ error: "Missing unfollow data" });
  }

  const sql = `
    DELETE FROM userFollowers
    WHERE follower_id = ? AND follower_type = ? AND following_id = ? AND following_type = ?
  `;

  db.query(
    sql,
    [follower_id, follower_type, following_id, following_type],
    (err, result) => {
      if (err) {
        console.error("Unfollow error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Not following this user" });
      }

      res.json({ status: "Unfollowed successfully" });
    },
  );
});

router.get("/add/:id/:type/followers", (req, res) => {
  const { id, type } = req.params;

  // Map user type to table and ID field
  const tableMap = {
    sales: { table: "salespersons", idField: "salespersonsid" },
    territory: { table: "territorypartner", idField: "id" },
    onboarding: { table: "onboardingpartner", idField: "partnerid" },
    projectpartner: { table: "projectpartner", idField: "id" },
  };

  const userMeta = tableMap[type];
  if (!userMeta) {
    return res.status(400).json({ error: "Invalid user type" });
  }

  const sql = `
    SELECT u.${userMeta.idField} AS id, u.fullname, u.userimage
    FROM userFollowers f
    JOIN ${userMeta.table} u ON u.${userMeta.idField} = f.follower_id
    WHERE f.following_id = ? AND f.following_type = ?
  `;

  db.query(sql, [id, type], (err, results) => {
    if (err) {
      console.error("Fetch followers error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json(results);
  });
});

router.get("/add/:id/:type/following-posts", (req, res) => {
  const { id, type } = req.params;

  const postMap = {
    sales: {
      postTable: "salespersonposts",
      userTable: "salespersons",
      userIdField: "salespersonsid",
    },
    territory: {
      postTable: "territorypartnerposts",
      userTable: "territorypartner",
      userIdField: "territorypartnerid",
    },
    // onboarding: {
    //   postTable: 'onboardingposts',
    //   userTable: 'onboardingpartner',
    //   userIdField: 'partnerid',
    // },
    // projectpartner: {
    //   postTable: 'projectpartnerposts',
    //   userTable: 'projectpartner',
    //   userIdField: 'id',
    // },
  };

  const map = postMap[type];
  if (!map) return res.status(400).json({ error: "Invalid user type" });

  const query = `
    SELECT
      p.postId,
      p.userId,
      p.postContent,
      p.image,
      p.likes,
      p.created_at,
      u.fullname,
      u.city,
      u.userimage
    FROM ${map.postTable} p
    JOIN userFollowers f ON f.following_id = p.userId AND f.following_type = ?
    JOIN ${map.userTable} u ON p.userId = u.${map.userIdField}
    WHERE f.follower_id = ? AND f.follower_type = ?
    ORDER BY p.created_at DESC
  `;

  db.query(query, [type, id, type], (err, result) => {
    if (err) {
      console.error("Fetch following posts error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json(result);
  });
});

router.get("/add/:id/:type/following", (req, res) => {
  const { id, type } = req.params;
  console.log(id, type, "ggggggggggggggg");

  // Map user type to table and ID field
  const tableMap = {
    sales: { table: "salespersons", idField: "salespersonsid" },
    territory: { table: "territorypartner", idField: "id" },
    onboarding: { table: "onboardingpartner", idField: "partnerid" },
    projectpartner: { table: "projectpartner", idField: "id" },
  };

  const userMeta = tableMap[type];
  if (!userMeta) {
    console.log("Invalid user type");

    return res.status(400).json({ error: "Invalid user type" });
  }

  const sql = `
    SELECT u.${userMeta.idField} AS id, u.fullname, u.userimage
    FROM userFollowers f
    JOIN ${userMeta.table} u 
      ON u.${userMeta.idField} = f.following_id
    WHERE f.follower_id = ? AND f.follower_type = ?
  `;

  db.query(sql, [id, type], (err, results) => {
    if (err) {
      console.error("Fetch following error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json(results);
  });
});

// Update availability
router.post("/update-availability/:id", async (req, res) => {
  try {
    console.log("loggg");

    const Id = req.params.id;
    const { isAvailable, inactiveUntil } = req.body;

    await db.query(
      "UPDATE territorypartner SET is_active = ?, inactive_until = ? WHERE id = ?",
      [isAvailable, inactiveUntil || null, Id],
    );

    res.json({ success: true, message: "Availability updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "DB error" });
  }
});

// Set inactive date
// router.post("/set-inactive/:id", async (req, res) => {
//   const partnerId = req.params.id;
//   const { isAvailable, inactiveUntil } = req.body;

//   try {
//     await db.query(
//       "UPDATE territorypartner SET is_active = ?, inactive_until = ? WHERE id = ?",
//       [isAvailable, inactiveUntil, partnerId]
//     );

//     res.json({ success: true, message: "Availability updated successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

router.post("/set-inactive/:id", async (req, res) => {
  const partnerId = req.params.id;
  const { isAvailable, inactiveDates } = req.body; // expect array

  try {
    await db.query(
      "UPDATE territorypartner SET is_active = ?, inactive_until = ? WHERE id = ?",
      [isAvailable, JSON.stringify(inactiveDates), partnerId],
    );

    res.json({ success: true, message: "Availability updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /territorypartner/:id/unavailable-dates
router.get("/unavailable-dates/:id", async (req, res) => {
  const partnerId = req.params.id;

  try {
    const [rows] = await db.query(
      "SELECT inactive_until FROM territorypartner WHERE id = ?",
      [partnerId],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    }

    let unavailableDates = [];
    if (rows[0].inactive_until) {
      try {
        unavailableDates = JSON.parse(rows[0].inactive_until);
      } catch (err) {
        console.error("Invalid JSON in inactive_until:", err);
      }
    }

    res.json({ success: true, unavailableDates });
  } catch (err) {
    console.error(" Error fetching unavailable dates:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /territorypartner/:id/unavailable-dates
router.delete("/delete/unavailable-dates/:id", (req, res) => {
  const partnerId = req.params.id;
  const date = req.body?.date || req.query?.date; // allow both body & query param

  if (!date) {
    return res
      .status(400)
      .json({ success: false, message: "Provide a date to remove" });
  }

  // First find the path of the date in the JSON array
  const searchSQL = `
    SELECT JSON_UNQUOTE(JSON_SEARCH(inactive_until, 'one', ?)) AS path
    FROM territorypartner
    WHERE id = ?
  `;

  db.query(searchSQL, [date, partnerId], (err, rows) => {
    if (err) {
      console.error(" Error searching date:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error", error: err });
    }

    const path = rows[0]?.path;

    if (!path) {
      return res.json({ success: false, message: "Date not found" });
    }

    // Now remove the date from JSON array
    const updateSQL = `
      UPDATE territorypartner
      SET inactive_until = JSON_REMOVE(inactive_until, ?)
      WHERE id = ?
    `;

    db.query(updateSQL, [path, partnerId], (err2, result) => {
      if (err2) {
        console.error(" Error removing date:", err2);
        return res
          .status(500)
          .json({ success: false, message: "Database error", error: err2 });
      }

      if (!result.affectedRows) {
        return res.json({ success: false, message: "Nothing updated" });
      }

      res.json({ success: true, message: "Date removed successfully" });
    });
  });
});

export default router;
