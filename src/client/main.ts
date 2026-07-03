import { io } from 'socket.io-client';

const status = document.getElementById('status')!;

const socket = io();

socket.on('hello', () => {
  status.textContent = 'conectado ao servidor ✔';
});

socket.on('disconnect', () => {
  status.textContent = 'desconectado — tentando reconectar…';
});
