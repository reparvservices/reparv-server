import { WebSocketServer } from "ws";
import { runAgent } from "./agent.js";
import { DEFAULT_LANGUAGE } from "./prompt.js";
import {
  resolveChatSessionFromRequest,
  formatSessionResponse,
} from "./session.js";

const WS_PATH = "/agent/ws";
const MAX_MSG_PER_MIN =
  Number(process.env.AI_RATE_LIMIT_MAX) || 30;

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function validateApiKey(req) {
  const expected = process.env.AI_AGENT_PUBLIC_KEY;
  if (!expected) return true;

  const url = new URL(req.url, "http://localhost");
  const key = url.searchParams.get("apiKey") || url.searchParams.get("api_key");
  return key === expected;
}

function createRateLimiter(limit) {
  const timestamps = [];
  return {
    tryConsume() {
      const now = Date.now();
      while (timestamps.length && now - timestamps[0] > 60_000) {
        timestamps.shift();
      }
      if (timestamps.length >= limit) return false;
      timestamps.push(now);
      return true;
    },
  };
}

async function handleChatMessage(ws, state, body) {
  if (state.busy) {
    sendJson(ws, {
      type: "error",
      message: "Please wait for the current reply to finish.",
    });
    return;
  }

  if (!state.rateLimiter.tryConsume()) {
    sendJson(ws, {
      type: "error",
      message: "Too many messages. Please wait a moment.",
    });
    return;
  }

  const message = String(body.message || "").trim();
  if (!message) {
    sendJson(ws, { type: "error", message: "message is required" });
    return;
  }

  let session;
  try {
    session = resolveChatSessionFromRequest(body);
  } catch (err) {
    sendJson(ws, { type: "error", message: err.message });
    return;
  }

  state.busy = true;
  sendJson(ws, { type: "typing", active: true });

  try {
    const result = await runAgent({
      session,
      message,
      language: body.language || DEFAULT_LANGUAGE,
    });

    sendJson(ws, {
      type: "reply",
      session: formatSessionResponse(session),
      reply: result.reply,
      properties: result.properties,
      toolCalls: result.toolCalls,
      lead: result.lead,
      disabled: result.disabled || false,
    });
  } catch (err) {
    console.error("[ai/ws]", err);
    sendJson(ws, {
      type: "error",
      message: err.message || "AI agent error",
    });
  } finally {
    state.busy = false;
    sendJson(ws, { type: "typing", active: false });
  }
}

export function attachAgentSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== WS_PATH) return;

    if (!validateApiKey(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    const state = {
      busy: false,
      rateLimiter: createRateLimiter(MAX_MSG_PER_MIN),
    };

    sendJson(ws, {
      type: "ready",
      agentEnabled: process.env.AI_AGENT_ENABLED !== "0",
    });

    ws.on("message", async (raw) => {
      let body;
      try {
        body = JSON.parse(String(raw));
      } catch {
        sendJson(ws, { type: "error", message: "Invalid JSON message" });
        return;
      }

      if (body.type === "ping") {
        sendJson(ws, { type: "pong" });
        return;
      }

      if (body.type === "chat") {
        await handleChatMessage(ws, state, body);
        return;
      }

      sendJson(ws, {
        type: "error",
        message: 'Unknown message type. Use { "type": "chat", "message": "..." }',
      });
    });

    ws.on("error", (err) => {
      console.error("[ai/ws] connection error:", err.message);
    });
  });

  return wss;
}

export { WS_PATH };
