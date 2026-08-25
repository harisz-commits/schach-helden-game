import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const isYouTube = process.env.BUILD_TARGET === 'youtube';

/** Official YouTube Playables SDK. Must load before any game code. */
const YOUTUBE_SDK_URL = 'https://www.youtube.com/game_api/v1';

/**
 * Injects the Playables SDK ahead of the game bundle for `build:youtube`.
 *
 * The SDK has to be present before our code runs, because YouTubePlatform
 * checks `window.ytgame` to decide which adapter to use. Keeping the injection
 * here means index.html stays a plain web page for normal builds.
 */
function youtubePlayablesSdk(): Plugin {
  return {
    name: 'crownbound:youtube-playables-sdk',
    apply: 'build',
    transformIndexHtml() {
      if (!isYouTube) return [];
      return [
        {
          tag: 'script',
          attrs: { src: YOUTUBE_SDK_URL },
          injectTo: 'head-prepend' as const,
        },
      ];
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [youtubePlayablesSdk()],
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
