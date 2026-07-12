import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../shared/protocol';
import { loadCharacters } from './core/characters';
import { RoomManager } from './core/rooms';
import { BatataMode } from './modes/batata/mode';
import { BomberMode } from './modes/bomber/mode';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(httpServer);

// In production the server also serves the built client; in dev, Vite serves
// the client on :5173 and proxies /socket.io here.
if (process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.resolve(here, '../../dist/client')));
}

const rooms = new RoomManager(io, (modeId, deps) =>
  modeId === 'batata' ? new BatataMode(deps) : new BomberMode(deps),
);
io.on('connection', (socket) => rooms.handleConnection(socket));

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, () => {
  console.log(`Jogo da Retro — server listening on :${port}`);
  console.log(`Personagens: ${loadCharacters().map((c) => c.nome).join(', ')}`);
});
