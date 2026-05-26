// ========================================
// Server Entry Point
// Sets up Express, HTTP Server, and WebSocketServer
// ========================================

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from './network/WebSocketServer.js';

// Setup ES Modules path variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3001;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', players: 0 }); // roomManager players count can be added later
});

// Serve client assets in production
const distPath = path.join(__dirname, '../client');
app.use(express.static(distPath));

// For SPA routing, serve index.html for any other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize our WebSocketServer
const wsServer = new WebSocketServer(server);

// Start listening
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[Server] Listening on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket Upgrade active`);
  console.log(`==================================================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down...');
  wsServer.shutdown();
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
