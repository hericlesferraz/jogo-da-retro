import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// In production the server also serves the built client; in dev, Vite serves
// the client on :5173 and proxies /socket.io here.
if (process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.resolve(here, '../../dist/client')));
}

io.on('connection', (socket) => {
  console.log(`[ws] connected: ${socket.id}`);
  socket.emit('hello', { serverTime: Date.now() });
  socket.on('disconnect', (reason) => {
    console.log(`[ws] disconnected: ${socket.id} (${reason})`);
  });
});

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, () => {
  console.log(`Jogo da Retro — server listening on :${port}`);
});
