/**
 * CLI: index a document into RAG
 * Usage: node src/ai/scripts/index-knowledge.js --title "FAQ" --file ./uploads/faq.pdf --propertyId 1
 */
import "dotenv/config";
import { indexDocument } from "../../vector/vector.service.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.title || (!args.file && !args.text)) {
  console.error(
    "Usage: node src/ai/scripts/index-knowledge.js --title NAME --file PATH [--propertyId N] [--docType brochure]",
  );
  process.exit(1);
}

const result = await indexDocument({
  title: args.title,
  filePath: args.file,
  rawText: args.text,
  propertyId: args.propertyId ? Number(args.propertyId) : null,
  docType: args.docType || "other",
});

console.log("Indexed:", result);
process.exit(0);
