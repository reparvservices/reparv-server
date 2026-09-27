import { propertySearch } from "./properties.js";
import { getProjectDetails } from "./project.js";
import { createLead, assignToSalesAgent } from "./crm.js";
import { scheduleSiteVisit } from "./siteVisit.js";
import { calculateLeadScore } from "./leads.js";
import { searchFAQs, searchArticles, calculateEMI, listCities } from "./knowledge.js";

export async function executeTool(name, args, context) {
  const { userId } = context;

  switch (name) {
    case "searchProperties":
      return { properties: await propertySearch(args) };

    case "getProjectDetails":
      return getProjectDetails(args);

    case "createLead": {
      const result = await createLead({ userId, ...args });
      if (calculateLeadScore(args.purchaseTimeline) === "hot") {
        await assignToSalesAgent({
          userId,
          reason: "Hot lead — purchase within 30 days",
          enquirersId: result.enquirersid,
        });
      }
      return result;
    }

    case "scheduleSiteVisit":
      return scheduleSiteVisit({ ...args, enquirersId: args.enquirersId, userId });

    case "assignToSalesAgent":
      return assignToSalesAgent({
        userId,
        reason: args.reason,
        assignedTo: args.assignedTo,
        enquirersId: args.enquirersId,
      });

    // Read-only knowledge
    case "searchFAQs":
      return searchFAQs(args);

    case "searchArticles":
      return searchArticles(args);

    case "calculateEMI":
      return calculateEMI(args);

    case "listCities":
      return listCities(args);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
