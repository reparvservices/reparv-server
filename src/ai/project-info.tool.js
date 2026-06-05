import {
  getPropertyById,
  findPropertyByName,
} from "./property-search.tool.js";
import { semanticSearch, buildRagContext } from "../vector/vector.service.js";

export async function getProjectDetails({ propertyId, projectName, query }) {
  let property = null;
  let resolvedId = propertyId;

  if (!resolvedId && projectName) {
    const matches = await findPropertyByName(projectName);
    if (matches?.length) {
      resolvedId = matches[0].propertyid;
    }
  }

  if (resolvedId) {
    property = await getPropertyById(resolvedId);
  }

  const searchQuery =
    query ||
    (projectName
      ? `Project ${projectName} pricing amenities possession FAQ`
      : property
        ? `Project ${property.projectName} details`
        : "real estate project FAQ");

  let ragChunks = [];
  try {
    ragChunks = await semanticSearch({
      query: searchQuery,
      propertyId: resolvedId,
    });
  } catch (err) {
    console.warn("[project-info] RAG search skipped:", err.message);
  }

  const ragContext = buildRagContext(ragChunks);

  return {
    property,
    ragContext: ragContext || null,
    sourcesUsed: ragChunks.length,
    matches: projectName && !property ? await findPropertyByName(projectName) : [],
  };
}
