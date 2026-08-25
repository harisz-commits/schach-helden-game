import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const isYouTube = process.env.BUILD_TARGET === 'youtube';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __BUILD_TARGET__: JSON.stringify(isYouTube ? 'youtube' : 'web'),
  },
  build: {
    target: 'es2020',
    // YouTube Playables prefers a small number of files; keep the bundle whole.
    assetsInlineLimit: isYouTube ? 1024 * 1024 : 4096,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: isYouTube ? undefined : { phaser: ['phaser'] },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
