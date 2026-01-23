import express from "express";
import db from "../../config/dbconnect.js";
import { getAll } from "../../controllers/builderApp/userController.js";

const router = express.Router();

// Get all users (from controller)
router.get("/", getAll);

// ================== FOLLOW / UNFOLLOW ==================

// Follow
router.post("/add/follow", (req, res) => {
  const { follower_id, follower_type, following_id, following_type } = req.body;
  console.log(
    "Follow request ---------->:",
    follower_id,
    follower_type,
    following_id,
    following_type,
  );

  if (!follower_id || !following_id || !follower_type || !following_type) {
    return res.status(400).json({ error: "Missing follow data" });
  }

  // const sql = `
  //   INSERT INTO userFollowers (follower_id, follower_type, following_id, following_type)
  //   VALUES (?, ?, ?, ?)
  // `;
  const sql = `
  INSERT IGNORE INTO userFollowers (follower_id, follower_type, following_id, following_type)
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
      console.log("Followed successfully");
      res.json({ status: "Followed successfully" });
    },
  );
});

// Unfollow
router.post("/add/unfollow", (req, res) => {
  const { follower_id, follower_type, following_id, following_type } = req.body;
  console.log(
    "Unfollow request:",
    follower_id,
    follower_type,
    following_id,
    following_type,
  );

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

// ================== FOLLOWERS ==================

// router.get("/add/:id/:type/followers", (req, res) => {
//   const { id, type } = req.params;

//   const tableMap = {
//     sales: { table: "salespersons", idField: "salespersonsid", nameField: "fullname" },
//     territory: { table: "territorypartner", idField: "id", nameField: "fullname" },
//     onboarding: { table: "onboardingpartner", idField: "partnerid", nameField: "fullname" },
//     projectpartner: { table: "projectpartner", idField: "id", nameField: "fullname" },
//     builder: { table: "builders", idField: "builderid", nameField: "contact_person" },
//   };

//   const userMeta = tableMap[type];
//   if (!userMeta) return res.status(400).json({ error: "Invalid user type" });

//   const sql = `
//     SELECT u.${userMeta.idField} AS id, u.${userMeta.nameField} AS fullname, u.userimage
//     FROM userFollowers f
//     JOIN ${userMeta.table} u ON u.${userMeta.idField} = f.follower_id
//     WHERE f.following_id = ? AND f.following_type = ?
//   `;

//   db.query(sql, [id, type], (err, results) => {
//     if (err) {
//       console.error("Fetch followers error:", err);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//     res.json(results);
//   });
// });

router.get("/add/:id/:type/followers", (req, res) => {
  const { id, type } = req.params;

  // Table mapping for all user types
  const tableMap = {
    sales: {
      table: "salespersons",
      idField: "salespersonsid",
      nameField: "fullname",
    },
    territory: {
      table: "territorypartner",
      idField: "id",
      nameField: "fullname",
    },
    onboarding: {
      table: "onboardingpartner",
      idField: "partnerid",
      nameField: "fullname",
    },
    projectpartner: {
      table: "projectpartner",
      idField: "id",
      nameField: "fullname",
    },
    builder: {
      table: "builders",
      idField: "builderid",
      nameField: "contact_person",
    },
  };

  // First get list of follower ids + types
  const sql = `
    SELECT follower_id, follower_type
    FROM userFollowers
    WHERE following_id = ? AND following_type = ?
  `;

  db.query(sql, [id, type], async (err, rows) => {
    if (err) {
      console.error("Fetch followers error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (rows.length === 0) {
      return res.json([]); // no followers
    }

    // Now fetch details for each follower based on type
    const promises = rows
      .map((row) => {
        const meta = tableMap[row.follower_type];
        if (!meta) return null;

        return new Promise((resolve, reject) => {
          const q = `
          SELECT ${meta.idField} AS id, ${meta.nameField} AS fullname, userimage
          FROM ${meta.table}
          WHERE ${meta.idField} = ?
        `;
          db.query(q, [row.follower_id], (err2, result) => {
            if (err2) return reject(err2);
            resolve(result[0]); // only one user per id
          });
        });
      })
      .filter(Boolean);

    try {
      const results = await Promise.all(promises);
      res.json(results.filter(Boolean)); // remove nulls
    } catch (e) {
      console.error("Error fetching follower details:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });
});

// ================== FOLLOWING ==================

// router.get("/add/:id/:type/following", (req, res) => {
//   const { id, type } = req.params;

//   const tableMap = {
//     sales: { table: "salespersons", idField: "salespersonsid", nameField: "fullname" },
//     territory: { table: "territorypartner", idField: "id", nameField: "fullname" },
//     onboarding: { table: "onboardingpartner", idField: "partnerid", nameField: "fullname" },
//     projectpartner: { table: "projectpartner", idField: "id", nameField: "fullname" },
//     builder: { table: "builders", idField: "builderid", nameField: "contact_person" },
//   };

//   const userMeta = tableMap[type];
//   if (!userMeta) return res.status(400).json({ error: "Invalid user type" });

//   const sql = `
//     SELECT u.${userMeta.idField} AS id, u.${userMeta.nameField} AS fullname, u.userimage
//     FROM userFollowers f
//     JOIN ${userMeta.table} u ON u.${userMeta.idField} = f.following_id
//     WHERE f.follower_id = ? AND f.follower_type = ?
//   `;

//   db.query(sql, [id, type], (err, results) => {
//     if (err) {
//       console.error("Fetch following error:", err);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//     res.json(results);
//   });
// });
router.get("/add/:id/:type/following", (req, res) => {
  const { id, type } = req.params;

  // table mapping
  const tableMap = {
    sales: {
      table: "salespersons",
      idField: "salespersonsid",
      nameField: "fullname",
    },
    territory: {
      table: "territorypartner",
      idField: "id",
      nameField: "fullname",
    },
    onboarding: {
      table: "onboardingpartner",
      idField: "partnerid",
      nameField: "fullname",
    },
    projectpartner: {
      table: "projectpartner",
      idField: "id",
      nameField: "fullname",
    },
    builder: {
      table: "builders",
      idField: "builderid",
      nameField: "contact_person",
    },
  };

  // first get following list (ids + types)
  const sql = `
    SELECT following_id, following_type
    FROM userFollowers
    WHERE follower_id = ? AND follower_type = ?
  `;

  db.query(sql, [id, type], async (err, rows) => {
    if (err) {
      console.error("Fetch following error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (rows.length === 0) {
      return res.json([]); // no following
    }

    // Now fetch details from respective tables
    const promises = rows
      .map((row) => {
        const meta = tableMap[row.following_type];
        if (!meta) return null;

        return new Promise((resolve, reject) => {
          const q = `
          SELECT ${meta.idField} AS id, ${meta.nameField} AS fullname, userimage
          FROM ${meta.table}
          WHERE ${meta.idField} = ?
        `;
          db.query(q, [row.following_id], (err2, result) => {
            if (err2) return reject(err2);
            resolve(result[0]); // single record
          });
        });
      })
      .filter(Boolean);

    try {
      const results = await Promise.all(promises);
      res.json(results.filter(Boolean)); // return merged list
    } catch (e) {
      console.error("Error fetching following details:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });
});

// ================== FOLLOWING POSTS ==================

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
  };

  const map = postMap[type];
  if (!map) return res.status(400).json({ error: "Invalid user type" });

  const sql = `
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

  db.query(sql, [type, id, type], (err, result) => {
    if (err) {
      console.error("Fetch following posts error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json(result);
  });
});

// ================== LEGACY (Builders only) ==================

// Get followers of builder
router.get("/:id/followers", (req, res) => {
  const id = req.params.id;

  db.query(
    `
    SELECT s.builderid, s.contact_person, s.userimage
    FROM userfollowers f
    JOIN builders s ON s.builderid = f.follower_id
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

// Get following of builder
router.get("/:id/following", (req, res) => {
  const id = req.params.id;

  db.query(
    `
    SELECT s.builderid, s.contact_person, s.userimage
    FROM userfollowers f
    JOIN builders s ON s.builderid = f.following_id
    WHERE f.follower_id = ?
  `,
    [id],
    (err, result) => {
      if (err) {
        console.error("Error fetching following:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json(result);
    },
  );
});

export default router;
