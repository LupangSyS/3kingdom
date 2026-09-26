'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms');

function createServer(opts = {}) {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/health', (req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });
  const rooms = new RoomManager(io, opts);
  io.on('connection', (socket) => rooms.handle(socket));
  return { app, server, io, rooms };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const botDelay = process.env.BOT_DELAY !== undefined ? Number(process.env.BOT_DELAY) : undefined;
  const { server } = createServer({ botDelay });
  server.listen(port, () => console.log(`สามก๊ก กลยุทธ์ online พร้อมที่ http://localhost:${port}`));
}

module.exports = { createServer };
