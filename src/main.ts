import { createGame } from './core/Game';
import { createPlatform, setPlatform } from './platform';

setPlatform(createPlatform());
const game = createGame('game');

// Keep the canvas sized to the visual viewport, which is what actually
// changes when a mobile browser shows or hides its URL bar.
if (typeof window !== 'undefined') {
  const resize = () => game.scale.refresh();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  window.visualViewport?.addEventListener('resize', resize);
}

export default game;
