'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms');
const { createStudio } = require('./studio');

function createServer(opts = {}) {
  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');
  const artDir = opts.artDir || path.join(publicDir, 'art');
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });
  const studio = createStudio({ artDir, env: opts.env, onChange: (m) => io.emit('art', m) });
  app.use('/api/studio', studio.router);
  app.use('/art', express.static(artDir, { maxAge: '1h' }));
  app.get('/studio', (req, res) => res.sendFile(path.join(publicDir, 'studio.html')));
  app.use(express.static(publicDir));
  app.get('/health', (req, res) => res.json({ ok: true }));
  const rooms = new RoomManager(io, opts);
  io.on('connection', (socket) => rooms.handle(socket));
  return { app, server, io, rooms };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const botDelay = process.env.BOT_DELAY !== undefined ? Number(process.env.BOT_DELAY) : undefined;
  const { server } = createServer({ botDelay, artDir: process.env.ART_DIR || undefined });
  server.listen(port, () => console.log(`สามก๊ก กลยุทธ์ online พร้อมที่ http://localhost:${port}`));
}

module.exports = { createServer };
