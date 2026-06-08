import { getPropertyById, findPropertyByName } from "./properties.js";
import { semanticSearch, buildRagContext } from "../rag/index.js";

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
    console.warn("[ai/tools/project] RAG search skipped:", err.message);
  }

  return {
    property,
    ragContext: buildRagContext(ragChunks) || null,
    sourcesUsed: ragChunks.length,
    matches: projectName && !property ? await findPropertyByName(projectName) : [],
  };
}
