import { defineConfig } from 'vite';

export default defineConfig({
  base: "/g2-flashcards/",
  server: {
    host: true,
    port: 5173,
  },
});
