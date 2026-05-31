import { listPartnerJoinLeads } from "../../frontend/services/partnerJoinLead.service.js";

export const getPartnerJoinLeads = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "all").trim();

    const result = await listPartnerJoinLeads({ search, status, page, limit });
    res.json(result);
  } catch (err) {
    console.error("[getPartnerJoinLeads]", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        message: "Partner join leads table not found. Run migration 005_partner_join_leads.sql.",
      });
    }
    res.status(500).json({ message: "Failed to fetch partner join leads" });
  }
};
