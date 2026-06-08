import fs from "fs/promises";
import path from "path";
import moment from "moment-timezone";
import db from "#db/promise";
import {
  createEmbedding,
  createEmbeddingsBatch,
  cosineSimilarity,
} from "./embeddings.js";

const CHUNK_SIZE = Number(process.env.AI_RAG_CHUNK_SIZE) || 900;
const CHUNK_OVERLAP = Number(process.env.AI_RAG_CHUNK_OVERLAP) || 120;
const TOP_K = Number(process.env.AI_RAG_TOP_K) || 6;

function now() {
  return moment().format("YYYY-MM-DD HH:mm:ss");
}

function chunkText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function extractPdfText(filePath) {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (err) {
    console.warn("[ai/rag] PDF parse failed:", err.message);
    return "";
  }
}

export async function indexDocument({
  title,
  docType = "other",
  filePath,
  rawText,
  propertyId,
}) {
  const ts = now();
  let text = rawText || "";

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
      text = await extractPdfText(filePath);
    } else {
      text = await fs.readFile(filePath, "utf8").catch(() => "");
    }
  }

  if (!text?.trim()) {
    throw new Error("No text content to index");
  }

  const [docInsert] = await db.query(
    `INSERT INTO ai_knowledge_documents (propertyid, title, doc_type, source_path, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [propertyId || null, title, docType, filePath || null, ts, ts],
  );
  const documentId = docInsert.insertId;

  try {
    const chunks = chunkText(text);
    const embeddings = await createEmbeddingsBatch(chunks);

    for (let i = 0; i < chunks.length; i++) {
      await db.query(
        `INSERT INTO ai_knowledge_chunks (document_id, propertyid, chunk_index, content, embedding, token_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          propertyId || null,
          i,
          chunks[i],
          JSON.stringify(embeddings[i] || []),
          chunks[i].length,
          ts,
        ],
      );
    }

    await db.query(
      `UPDATE ai_knowledge_documents SET status = 'indexed', updated_at = ? WHERE id = ?`,
      [ts, documentId],
    );

    return { documentId, chunksIndexed: chunks.length };
  } catch (err) {
    await db.query(
      `UPDATE ai_knowledge_documents SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
      [err.message, now(), documentId],
    );
    throw err;
  }
}

export async function semanticSearch({ query, propertyId, limit = TOP_K }) {
  const qEmbedding = await createEmbedding(query);
  if (!qEmbedding.length) return [];

  const conditions = ["d.status = 'indexed'"];
  const params = [];
  if (propertyId) {
    conditions.push("(c.propertyid = ? OR d.propertyid = ?)");
    params.push(propertyId, propertyId);
  }

  const [rows] = await db.query(
    `SELECT c.id, c.content, c.embedding, c.propertyid, d.title, d.doc_type
     FROM ai_knowledge_chunks c
     INNER JOIN ai_knowledge_documents d ON d.id = c.document_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.id DESC
     LIMIT 500`,
    params,
  );

  const scored = rows
    .map((row) => {
      let emb = [];
      try {
        emb = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;
      } catch {
        emb = [];
      }
      return {
        content: row.content,
        title: row.title,
        docType: row.doc_type,
        propertyId: row.propertyid,
        score: cosineSimilarity(qEmbedding, emb),
      };
    })
    .filter((r) => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

export function buildRagContext(chunks) {
  if (!chunks?.length) return "";
  return chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.title || "document"} (${c.docType || "doc"})]\n${c.content}`,
    )
    .join("\n\n---\n\n");
}
