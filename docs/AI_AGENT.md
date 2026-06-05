# Real Estate AI Advisor

Production conversational agent for **website chat** and **WhatsApp**, backed by your existing **MySQL CRM** (`properties`, `enquirers`, `propertyfollowup`) and an optional **RAG** knowledge base for project PDFs/FAQs.

> **Note:** This codebase uses **MySQL**, not MongoDB. Property search and leads read/write the same tables your admin and frontend apps already use.

## Architecture

```
Website / WhatsApp
       ↓
  agent.service.js  (OpenAI Responses API + tools)
       ↓
┌──────┴──────┬─────────────┬──────────────┐
│ MySQL CRM   │ ai_* tables │ RAG chunks   │
│ properties  │ memory      │ embeddings   │
│ enquirers   │ lead scores │              │
└─────────────┴─────────────┴──────────────┘
```

### Folder layout

```
src/ai/           — agent, tools, memory, prompts
src/vector/       — embeddings + semantic search
src/whatsapp/     — WhatsApp reply orchestration
src/routes/       — REST API
migrations/       — ai_agent.sql
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Run database migration

```bash
mysql -u USER -p DB_NAME < migrations/ai_agent.sql
```

### 3. Environment variables

Copy `.env.example` and set at minimum:

- `OPENAI_API_KEY`
- `AI_AGENT_ENABLED=1`
- `AI_WHATSAPP_ENABLED=1` (for auto-reply on Meta webhook)
- Existing `DB_*` and `WHATSAPP_*` variables

### 4. Index project documents (RAG)

Place PDFs/brochures on the server, then:

```bash
curl -X POST http://localhost:5000/api/ai/index-document \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Project Alpha Brochure",
    "docType": "brochure",
    "filePath": "/absolute/path/to/brochure.pdf",
    "propertyId": 123
  }'
```

Or pass `rawText` instead of `filePath` for FAQ text.

### 5. Start server

```bash
npm run dev
```

## REST API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/chat` | Website chat turn |
| POST | `/api/ai/whatsapp` | Test WhatsApp flow (manual) |
| POST | `/api/ai/search-properties` | Direct property search |
| POST | `/api/ai/lead-score` | Compute/store lead score |
| GET | `/api/ai/conversation/:userId` | Load memory + lead profile |
| POST | `/api/ai/index-document` | Ingest RAG document |

Routes are **public** (before JWT) but support optional `AI_AGENT_PUBLIC_KEY` via header `x-ai-api-key`. Rate limited (default 30 req/min).

### Example: Website chat

**Request**

```http
POST /api/ai/chat
Content-Type: application/json

{
  "userId": "guest-uuid-or-session-id",
  "message": "I need 2 BHK in Pune under 90 lakh",
  "channel": "web",
  "language": "en"
}
```

**Response**

```json
{
  "success": true,
  "reply": "Here are some options in Pune under ₹90 L...",
  "properties": [
    {
      "rank": 1,
      "propertyId": 42,
      "projectName": "Sample Residency",
      "location": "Wakad, Pune",
      "price": "₹85.00 L",
      "bedrooms": "2 BHK",
      "amenities": ["Clubhouse", "Gym"]
    }
  ],
  "toolCalls": ["searchProperties"],
  "lead": { "leadScore": null, "leadStatus": "qualifying" }
}
```

### Example: Lead score

```http
POST /api/ai/lead-score
Content-Type: application/json

{
  "userId": "guest-123",
  "purchaseTimeline": "within 30 days",
  "phone": "9876543210",
  "city": "Pune",
  "budgetMax": 9000000
}
```

```json
{
  "success": true,
  "leadScore": "hot",
  "leadStatus": "qualifying"
}
```

### Example: Get conversation memory

```http
GET /api/ai/conversation/guest-123?channel=web
```

## WhatsApp flow

Meta webhook: `POST /webhooks/whatsapp-chat`

1. Logs inbound message to `whatsapp_admin_chat`
2. If `AI_WHATSAPP_ENABLED=1`, runs the agent asynchronously
3. Sends GPT reply via existing `sendTextMessage` and logs outbound

User id for memory: `wa:{phone_e164}`.

## Agent tools (OpenAI Responses API)

| Tool | Action |
|------|--------|
| `searchProperties` | Query `properties` + `propertiesinfo` |
| `getProjectDetails` | Property record + RAG semantic search |
| `createLead` | Insert/update `enquirers` + `ai_lead_profiles` |
| `scheduleSiteVisit` | `propertyfollowup` + `enquirers.visitdate` |
| `assignToSalesAgent` | `lead_status: human_handoff` |

## Lead scoring

| Score | Timeline |
|-------|----------|
| **hot** | Purchase within ~30 days |
| **warm** | Within ~3 months |
| **cold** | After 3 months / exploring |

Hot leads trigger automatic `assignToSalesAgent`.

## Human handoff

Triggered when:

- User asks for callback / human support
- Tool `assignToSalesAgent` is called
- Hot lead on `createLead`

Stored in `ai_lead_profiles.lead_status = 'human_handoff'` and appended to `enquirers.message`.

## Deployment checklist

1. Run `migrations/ai_agent.sql` on production MySQL
2. Set `OPENAI_API_KEY`, `AI_AGENT_ENABLED=1`, `AI_WHATSAPP_ENABLED=1`
3. Confirm WhatsApp webhook URL in Meta Business Manager
4. Set `AI_AGENT_PUBLIC_KEY` for production website widget
5. Index brochures per project via `/api/ai/index-document`
6. Monitor logs for `[ai/chat]` and `[whatsapp/ai]` errors

## Security

- Never commit `.env` or API keys
- Use `AI_AGENT_PUBLIC_KEY` on public endpoints
- Rate limiting via `express-rate-limit`
- Agent instructed not to hallucinate prices or inventory
