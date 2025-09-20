/**
 * Simple HTTP server for serving Neptune's Pride game files during testing
 * This creates a local environment that mimics the game's structure
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const GAME_FILES_DIR = path.join(__dirname, '../../test-game-files');
const STATIC_DIR = path.join(__dirname, 'static');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveFile(res: http.ServerResponse, filePath: string): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 
      'Content-Type': mimeType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  let filePath: string;
  
  // Route game script files
  if (req.url.startsWith('/scripts/client/')) {
    const gameFile = req.url.substring('/scripts/client/'.length);
    filePath = path.join(GAME_FILES_DIR, gameFile);
  }
  // Route static test files
  else if (req.url === '/' || req.url === '/index.html') {
    filePath = path.join(STATIC_DIR, 'test-game.html');
  }
  else if (req.url.startsWith('/static/')) {
    filePath = path.join(STATIC_DIR, req.url.substring('/static/'.length));
  }
  // Default to static directory
  else {
    filePath = path.join(STATIC_DIR, req.url);
  }

  // Security check - ensure we're not serving files outside our directories
  const resolvedPath = path.resolve(filePath);
  const gameFilesPath = path.resolve(GAME_FILES_DIR);
  const staticPath = path.resolve(STATIC_DIR);
  
  if (!resolvedPath.startsWith(gameFilesPath) && !resolvedPath.startsWith(staticPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  console.log(`Serving game files from: ${GAME_FILES_DIR}`);
  console.log(`Serving static files from: ${STATIC_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down test server...');
  server.close(() => {
    process.exit(0);
  });
});

export default server;