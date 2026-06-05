import OpenAI from "openai";

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

let client;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function createEmbedding(text) {
  const input = String(text || "").trim().slice(0, 8000);
  if (!input) return [];

  const openai = getClient();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  return res.data[0]?.embedding || [];
}

export async function createEmbeddingsBatch(texts) {
  const inputs = texts.map((t) => String(t || "").trim().slice(0, 8000)).filter(Boolean);
  if (!inputs.length) return [];

  const openai = getClient();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}
