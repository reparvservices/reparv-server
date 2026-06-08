import crypto from "crypto";
import { AGENT_NAME, DEFAULT_LANGUAGE } from "../prompt.js";
import { CHAT_MODES } from "../session.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolvePageSession(req) {
  const mode =
    req.query?.mode === CHAT_MODES.USER ? CHAT_MODES.USER : CHAT_MODES.GUEST;

  if (mode === CHAT_MODES.USER) {
    const userId = String(req.query?.userId || "").trim();
    return {
      mode: CHAT_MODES.USER,
      userId: userId || null,
      guestId: null,
    };
  }

  const fromQuery = String(req.query?.guestId || "").trim();
  const guestId = fromQuery
    ? fromQuery.startsWith("guest:")
      ? fromQuery
      : `guest:${fromQuery.replace(/^guest-/, "")}`
    : `guest:${crypto.randomUUID()}`;

  return {
    mode: CHAT_MODES.GUEST,
    userId: null,
    guestId: guestId.slice(0, 64),
  };
}

export function renderAgentChatPage(req) {
  const pageSession = resolvePageSession(req);
  const config = {
    chatPath: "/api/ai/chat",
    requiresApiKey: Boolean(process.env.AI_AGENT_PUBLIC_KEY),
    agentEnabled: process.env.AI_AGENT_ENABLED !== "0",
    mode: pageSession.mode,
    initialUserId: pageSession.userId,
    initialGuestId: pageSession.guestId,
    agentName: AGENT_NAME,
    language: String(req.query?.language || DEFAULT_LANGUAGE).slice(0, 8),
  };

  const modeBadge =
    pageSession.mode === CHAT_MODES.USER ? "App user" : "Guest";
  const sessionLabel =
    pageSession.mode === CHAT_MODES.USER ? "App user ID" : "Guest session ID";
  const sessionValue =
    pageSession.mode === CHAT_MODES.USER
      ? pageSession.userId || ""
      : pageSession.guestId || "";
  const sessionHint =
    pageSession.mode === CHAT_MODES.USER
      ? "Logged-in app users are tracked by user ID."
      : "Anonymous website visitors get a guest session stored in this browser.";

  const disabledBanner = config.agentEnabled
    ? ""
    : `<div class="banner banner-warn">AI agent is disabled (AI_AGENT_ENABLED=0). Replies will show an unavailable message.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(AGENT_NAME)} — Reparv</title>
  <meta name="description" content="Chat with the Reparv real estate AI advisor." />
  <style>
    :root {
      --bg: #f4f6f8;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --brand: #0d9488;
      --brand-dark: #0f766e;
      --user: #0d9488;
      --bot: #f1f5f9;
      --warn-bg: #fffbeb;
      --warn-text: #92400e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    header p { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted); }
    .badge {
      font-size: 0.75rem;
      background: #ccfbf1;
      color: var(--brand-dark);
      padding: 0.25rem 0.6rem;
      border-radius: 999px;
      font-weight: 500;
    }
    .banner {
      padding: 0.65rem 1rem;
      font-size: 0.85rem;
      text-align: center;
    }
    .banner-warn {
      background: var(--warn-bg);
      color: var(--warn-text);
      border-bottom: 1px solid #fde68a;
    }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 820px;
      width: 100%;
      margin: 0 auto;
      padding: 1rem;
      min-height: 0;
    }
    .settings {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
      font-size: 0.85rem;
    }
    .settings summary { cursor: pointer; color: var(--muted); user-select: none; }
    .settings-grid { display: grid; gap: 0.6rem; margin-top: 0.75rem; }
    .settings label {
      display: block;
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 0.2rem;
    }
    .settings input {
      width: 100%;
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: inherit;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
    .chip {
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .chip:hover { border-color: var(--brand); color: var(--brand-dark); }
    #messages {
      flex: 1;
      overflow-y: auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: 360px;
    }
    .msg {
      max-width: 85%;
      padding: 0.7rem 0.9rem;
      border-radius: 14px;
      line-height: 1.45;
      font-size: 0.92rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--user);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .msg.bot {
      align-self: flex-start;
      background: var(--bot);
      color: var(--text);
      border-bottom-left-radius: 4px;
    }
    .msg.error {
      align-self: stretch;
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .meta { margin-top: 0.5rem; font-size: 0.72rem; color: var(--muted); }
    .composer { display: flex; gap: 0.6rem; margin-top: 0.75rem; }
    .composer input {
      flex: 1;
      padding: 0.8rem 1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      font: inherit;
      background: var(--surface);
    }
    .composer input:focus {
      outline: 2px solid #99f6e4;
      border-color: var(--brand);
    }
    .composer button {
      padding: 0.8rem 1.2rem;
      border: none;
      border-radius: 12px;
      background: var(--brand);
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .composer button:disabled { opacity: 0.6; cursor: not-allowed; }
    .composer button:hover:not(:disabled) { background: var(--brand-dark); }
    .typing {
      align-self: flex-start;
      color: var(--muted);
      font-size: 0.85rem;
      padding: 0.25rem 0.5rem;
    }
    .status {
      font-size: 0.75rem;
      padding: 0.25rem 0.6rem;
      border-radius: 999px;
      font-weight: 500;
    }
    .status-connecting { background: #fef3c7; color: #92400e; }
    .status-connected { background: #d1fae5; color: #065f46; }
    .status-disconnected { background: #fee2e2; color: #991b1b; }
    .property-cards {
      align-self: stretch;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-top: 0.25rem;
    }
    .property-card {
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .property-card:hover {
      border-color: var(--brand);
      box-shadow: 0 4px 14px rgba(13, 148, 136, 0.12);
    }
    .property-card img {
      width: 100%;
      height: 140px;
      object-fit: cover;
      background: #e2e8f0;
      display: block;
    }
    .property-card .no-img {
      width: 100%;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #e2e8f0, #f8fafc);
      color: var(--muted);
      font-size: 0.8rem;
    }
    .property-card-body { padding: 0.75rem; }
    .property-card-body h3 {
      margin: 0 0 0.35rem;
      font-size: 0.9rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .property-card-body p {
      margin: 0.15rem 0;
      font-size: 0.78rem;
      color: var(--muted);
    }
    .property-card-body .price {
      margin-top: 0.4rem;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--brand-dark);
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(AGENT_NAME)}</h1>
      <p>Find properties, get project details, and connect with sales</p>
    </div>
    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
      <span id="connStatus" class="status status-connected">Ready</span>
      <span class="badge">${escapeHtml(modeBadge)} · HTTP</span>
    </div>
  </header>
  ${disabledBanner}
  <main>
    <details class="settings"${config.requiresApiKey ? " open" : ""}>
      <summary>Settings</summary>
      <div class="settings-grid">
        <div>
          <label for="sessionId">${escapeHtml(sessionLabel)}</label>
          <input id="sessionId" type="text" value="${escapeHtml(sessionValue)}" ${pageSession.mode === CHAT_MODES.GUEST ? "readonly" : ""} />
          <p style="margin:0.35rem 0 0;font-size:0.75rem;color:var(--muted);">${escapeHtml(sessionHint)}</p>
        </div>
        ${
          config.requiresApiKey
            ? `<div>
          <label for="apiKey">API key (required)</label>
          <input id="apiKey" type="password" placeholder="x-ai-api-key" />
        </div>`
            : ""
        }
      </div>
    </details>
    <div class="chips">
      <button class="chip" type="button" data-prompt="Show me 2 BHK apartments in Pune under 90 lakh">2 BHK in Pune under 90L</button>
      <button class="chip" type="button" data-prompt="What properties do you have in Mumbai?">Properties in Mumbai</button>
      <button class="chip" type="button" data-prompt="I want to schedule a site visit next Saturday">Schedule site visit</button>
      <button class="chip" type="button" data-prompt="Connect me with a sales executive">Talk to sales</button>
    </div>
    <div id="messages" aria-live="polite"></div>
    <form class="composer" id="form">
      <input id="input" type="text" placeholder="Ask about properties, budgets, site visits…" autocomplete="off" />
      <button id="send" type="submit">Send</button>
    </form>
  </main>
  <script>
    window.__AI_AGENT_CONFIG__ = ${JSON.stringify(config)};
  </script>
  <script>
    const cfg = window.__AI_AGENT_CONFIG__;
    const STORAGE_GUEST = "reparv_ai_guest_id";
    const STORAGE_KEY = "reparv_ai_api_key";
    const MODE_USER = "user";
    const MODE_GUEST = "guest";

    const messagesEl = document.getElementById("messages");
    const form = document.getElementById("form");
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send");
    const sessionInput = document.getElementById("sessionId");
    const apiKeyInput = document.getElementById("apiKey");
    const connStatus = document.getElementById("connStatus");

    let httpReady = true;

    function getGuestId() {
      const stored = localStorage.getItem(STORAGE_GUEST);
      return stored || cfg.initialGuestId;
    }

    if (cfg.mode === MODE_GUEST) {
      const guestId = getGuestId();
      sessionInput.value = guestId;
      localStorage.setItem(STORAGE_GUEST, guestId);
    } else if (cfg.initialUserId) {
      sessionInput.value = cfg.initialUserId;
    }

    if (apiKeyInput) apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || "";

    if (cfg.mode === MODE_USER) {
      sessionInput.addEventListener("change", () => {
        sessionInput.value = sessionInput.value.trim();
      });
    }

    if (apiKeyInput) {
      apiKeyInput.addEventListener("change", () => {
        localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
      });
    }

    function addMessage(text, role, meta) {
      const el = document.createElement("div");
      el.className = "msg " + role;
      el.textContent = text;
      if (meta) {
        const m = document.createElement("div");
        m.className = "meta";
        m.textContent = meta;
        el.appendChild(m);
      }
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function renderPropertyCards(properties) {
      if (!properties?.length) return;

      const wrap = document.createElement("div");
      wrap.className = "property-cards";

      for (const p of properties) {
        const card = document.createElement("a");
        card.className = "property-card";
        if (p.url) {
          card.href = p.url;
          card.target = "_blank";
          card.rel = "noopener noreferrer";
        } else {
          card.href = "#";
          card.addEventListener("click", (e) => e.preventDefault());
        }

        if (p.imageUrl) {
          const img = document.createElement("img");
          img.src = p.imageUrl;
          img.alt = p.projectName || "Property";
          img.loading = "lazy";
          img.onerror = () => {
            img.replaceWith(createNoImageEl());
          };
          card.appendChild(img);
        } else {
          card.appendChild(createNoImageEl());
        }

        const body = document.createElement("div");
        body.className = "property-card-body";

        const title = document.createElement("h3");
        title.textContent = p.projectName || "Property";
        body.appendChild(title);

        if (p.location) {
          const loc = document.createElement("p");
          loc.textContent = p.location;
          body.appendChild(loc);
        }

        if (p.bedrooms) {
          const bhk = document.createElement("p");
          bhk.textContent = p.bedrooms;
          body.appendChild(bhk);
        }

        const price = document.createElement("p");
        price.className = "price";
        price.textContent = p.price || "Price on request";
        body.appendChild(price);

        card.appendChild(body);
        wrap.appendChild(card);
      }

      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function createNoImageEl() {
      const el = document.createElement("div");
      el.className = "no-img";
      el.textContent = "No image";
      return el;
    }

    addMessage(
      "Namaste! Main aapka " + cfg.agentName + " hoon. Properties, budget ya site visit — kuch bhi pooch sakte ho.",
      "bot",
    );

    let typingEl = null;
    let awaitingReply = false;

    function setConnStatus(state, label) {
      connStatus.className = "status status-" + state;
      connStatus.textContent = label;
    }

    function setLoading(on) {
      awaitingReply = on;
      sendBtn.disabled = on || !httpReady;
      input.disabled = on || !httpReady;
      if (on) {
        if (!typingEl) {
          typingEl = document.createElement("div");
          typingEl.className = "typing";
          typingEl.textContent = "Thinking…";
          messagesEl.appendChild(typingEl);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        return;
      }
      if (typingEl) {
        typingEl.remove();
        typingEl = null;
      }
    }

    function buildChatPayload(message) {
      const payload = {
        mode: cfg.mode,
        message,
        language: cfg.language,
      };

      if (cfg.mode === MODE_USER) {
        payload.userId = sessionInput.value.trim() || cfg.initialUserId;
      } else {
        const guestId = getGuestId();
        payload.guestId = guestId;
        localStorage.setItem(STORAGE_GUEST, guestId);
      }
      return payload;
    }

    function handleChatResponse(data) {
      if (data.type === "error") {
        setLoading(false);
        addMessage(data.message || "Error", "error");
        return;
      }

      if (data.type !== "reply") {
        setLoading(false);
        addMessage("Unexpected server response", "error");
        return;
      }

      setLoading(false);

      if (cfg.mode === MODE_GUEST && data.session?.guestId) {
        localStorage.setItem(STORAGE_GUEST, data.session.guestId);
        sessionInput.value = data.session.guestId;
      }

      const metaParts = [];
      if (data.session?.mode) metaParts.push("Mode: " + data.session.mode);
      if (data.toolCalls?.length) metaParts.push("Tools: " + data.toolCalls.join(", "));
      if (data.lead?.leadScore) metaParts.push("Lead: " + data.lead.leadScore);
      if (data.properties?.length) metaParts.push(data.properties.length + " properties found");

      addMessage(data.reply || "(empty reply)", "bot", metaParts.join(" · ") || null);
      renderPropertyCards(data.properties);
    }

    async function postChatMessage(payload) {
      const headers = { "Content-Type": "application/json" };
      const apiKey = apiKeyInput?.value.trim();
      if (apiKey) {
        headers["x-ai-api-key"] = apiKey;
      }

      const res = await fetch(cfg.chatPath, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid server response");
      }

      if (!res.ok) {
        throw new Error(data.message || "Request failed");
      }

      return data;
    }

    function refreshHttpReady() {
      if (cfg.requiresApiKey && apiKeyInput && !apiKeyInput.value.trim()) {
        httpReady = false;
        setConnStatus("disconnected", "API key required");
        sendBtn.disabled = true;
        input.disabled = true;
        return;
      }

      httpReady = true;
      setConnStatus("connected", "Ready");
      sendBtn.disabled = awaitingReply;
      input.disabled = awaitingReply;
    }

    async function sendMessage(text) {
      const message = text.trim();
      if (!message) return;

      if (cfg.mode === MODE_USER) {
        const userId = sessionInput.value.trim() || cfg.initialUserId;
        if (!userId) {
          addMessage("App user ID is required for user mode.", "error");
          return;
        }
      }

      if (cfg.requiresApiKey && apiKeyInput && !apiKeyInput.value.trim()) {
        addMessage("API key is required. Open Settings and enter your API key.", "error");
        return;
      }

      addMessage(message, "user");
      input.value = "";

      const payload = buildChatPayload(message);

      setLoading(true);
      try {
        const data = await postChatMessage(payload);
        handleChatResponse(data);
      } catch (err) {
        setLoading(false);
        setConnStatus("disconnected", "Request failed");
        addMessage(err.message || "Request failed", "error");
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage(input.value);
    });

    document.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => sendMessage(btn.dataset.prompt));
    });

    if (apiKeyInput) {
      apiKeyInput.addEventListener("change", () => {
        localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
        refreshHttpReady();
      });
    }

    refreshHttpReady();
    input.focus();
  </script>
</body>
</html>`;
}
