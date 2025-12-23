import moment from "moment";
import db from "../../config/dbconnect.js";

export const addVisitor = (req, res) => {
  const { propertyid, source } = req.body;

  if (!propertyid) {
    return res.status(400).json({ message: "propertyid is required" });
  }

  // Step 1: Check property exists
  const checkPropertySql = `
    SELECT propertyid FROM properties WHERE propertyid = ?
  `;

  db.query(checkPropertySql, [propertyid], (err, propertyResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (propertyResult.length === 0) {
      return res.status(404).json({ message: "Property does not exist" });
    }

    // Step 2: Check analytics record
    const checkAnalyticsSql = `
      SELECT id FROM property_analytics WHERE property_id = ?
    `;

    db.query(checkAnalyticsSql, [propertyid], (err2, results) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: "DB error" });
      }

      const isWhatsapp = source === "whatsapp" ? 1 : 0;
      const isCall = source === "call" ? 1 : 0;
      const isShare=source==='share'?1 :0;

      if (results.length > 0) {
        //  UPDATE ONLY (row already exists)
        const updateSql = `
          UPDATE property_analytics
          SET
            views = views + 1,
            whatsapp_enquiry = whatsapp_enquiry + ?,
            calls = calls + ? ,
            share = share + ?
          WHERE property_id = ?
        `;

        db.query(
          updateSql,
          [isWhatsapp, isCall,isShare, propertyid],
          (err3) => {
            if (err3) {
              console.error(err3);
              return res.status(500).json({ message: "DB error" });
            }

            res.json({
              message: "Analytics updated",
              source: source || "direct",
            });
          }
        );
      } else {
        // INSERT ONLY ONCE (first visit)
        const insertSql = `
          INSERT INTO property_analytics
            (property_id, views, whatsapp_enquiry, calls,share)
          VALUES (?, 1, ?, ?,?)
        `;

        db.query(
          insertSql,
          [propertyid, isWhatsapp, isCall,isShare],
          (err4) => {
            if (err4) {
              console.error(err4);
              return res.status(500).json({ message: "DB error" });
            }

            res.json({
              message: "Analytics created",
              source: source || "direct",
            });
          }
        );
      }
    });
  });
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
