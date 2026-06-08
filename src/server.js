import http from "http";
import "dotenv/config";
import "./core/utils/cron.js";
import app from "./app.js";
import { attachAgentSocket } from "./ai/socket.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
attachAgentSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`AI agent WebSocket: ws://localhost:${PORT}/agent/ws`);
});
