// ========================================
// Server Entry Point
// Sets up Express, HTTP Server, and WebSocketServer
// ========================================

import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "./network/WebSocketServer.js";

// Setup ES Modules path variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

const PORT = Number(process.env.PORT) || 3001;

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", players: 0 }); // roomManager players count can be added later
});

// Serve client assets in production
const distPath = path.join(__dirname, "../client");
app.use(express.static(distPath));

// For SPA routing, serve index.html for any other requests
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Initialize our WebSocketServer
const wsServer = new WebSocketServer(server);

// Start listening
server.listen(PORT, "0.0.0.0", () => {
  console.log("==================================================");
  console.log(`[Server] Listening on port ${PORT}`);
  console.log("[Server] WebSocket Upgrade active");
  console.log("==================================================");
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[Server] Port ${PORT} is already in use. Stop the existing server or run with PORT=${PORT + 1}.`,
    );
  } else {
    console.error("[Server] Failed to start:", error);
  }
  wsServer.shutdown();
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received. Shutting down...");
  wsServer.shutdown();
  server.close(() => {
    console.log("[Server] Server closed");
    process.exit(0);
  });
});
