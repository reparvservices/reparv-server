import moment from "moment";
import db from "../../config/dbconnect.js";

export const addVisitor = (req, res) => {
  const { propertyid, source = "view" } = req.body;

  if (!propertyid) {
    return res.status(400).json({ message: "propertyid is required" });
  }

  const validSources = ["view", "whatsapp", "call", "share"];
  if (!validSources.includes(source)) {
    return res.status(400).json({ message: "Invalid source type" });
  }

  const isView = source === "view" ? 1 : 0;
  const isWhatsapp = source === "whatsapp" ? 1 : 0;
  const isCall = source === "call" ? 1 : 0;
  const isShare = source === "share" ? 1 : 0;

  // 1 Check property exists
  db.query(
    `SELECT propertyid FROM properties WHERE propertyid = ?`,
    [propertyid],
    (err, propertyResult) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (propertyResult.length === 0)
        return res.status(404).json({ message: "Property does not exist" });

      // 2 Check analytics row
      db.query(
        `SELECT id FROM property_analytics WHERE property_id = ?`,
        [propertyid],
        (err2, results) => {
          if (err2) return res.status(500).json({ message: "DB error" });

          if (results.length > 0) {
            // UPDATE
            const updateSql = `
              UPDATE property_analytics
              SET
                views = views + ?,
                whatsapp_enquiry = whatsapp_enquiry + ?,
                calls = calls + ?,
                share = share + ?
              WHERE property_id = ?
            `;

            db.query(
              updateSql,
              [isView, isWhatsapp, isCall, isShare, propertyid],
              (err3) => {
                if (err3) return res.status(500).json({ message: "DB error" });

                res.json({
                  message: "Analytics updated",
                  source,
                });
              }
            );
          } else {
            // INSERT
            const insertSql = `
              INSERT INTO property_analytics
              (property_id, views, whatsapp_enquiry, calls, share)
              VALUES (?, ?, ?, ?, ?)
            `;

            db.query(
              insertSql,
              [propertyid, isView, isWhatsapp, isCall, isShare],
              (err4) => {
                if (err4) return res.status(500).json({ message: "DB error" });

                res.json({
                  message: "Analytics created",
                  source,
                });
              }
            );
          }
        }
      );
    }
  );
};

export const getTotalVisitors = (req, res) => {
  const { propertyid } = req.query;

  if (!propertyid) {
    return res.status(400).json({ message: "propertyid is required" });
  }

  const sql = `
    SELECT 
      p.propertyid,

      COALESCE(pa.views, 0) AS views,
      COALESCE(pa.calls, 0) AS calls,
      COALESCE(pa.share, 0) AS share,
      COALESCE(pa.whatsapp_enquiry, 0) AS whatsapp_enquiry

    FROM properties p
    LEFT JOIN property_analytics pa 
      ON pa.property_id = p.propertyid
    WHERE p.propertyid = ?
  `;

  db.query(sql, [propertyid], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Property does not exist" });
    }

    res.json({
      propertyid: result[0].propertyid,
      totalVisitors: result[0].views,
      calls: result[0].calls,
      share: result[0].share,
      whatsapp_enquiry: result[0].whatsapp_enquiry,
    });
  });
};
