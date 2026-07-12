import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/socket.io': {
        // Same PORT the game server reads, so `PORT=3210 npm run dev` works
        // when :3000 is taken by something else.
        target: `http://localhost:${process.env.PORT ?? 3000}`,
        ws: true,
      },
    },
  },
});
