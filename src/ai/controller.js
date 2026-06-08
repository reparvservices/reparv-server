import { renderAgentChatPage } from "./pages/agentChat.page.js";

export function getAgentPage(req, res) {
  res.type("html").send(renderAgentChatPage(req));
}
