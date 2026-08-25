import type { GamePlatform } from './GamePlatform';
import { LocalPlatform } from './LocalPlatform';
import { YouTubePlatform } from './YouTubePlatform';

let active: GamePlatform | null = null;

/** Chooses the adapter for the current host. */
export function createPlatform(): GamePlatform {
  if (YouTubePlatform.isAvailable()) return new YouTubePlatform();
  return new LocalPlatform();
}

export function setPlatform(platform: GamePlatform): void {
  active = platform;
}

export function platform(): GamePlatform {
  if (!active) {
    active = createPlatform();
  }
  return active;
}

export type { GamePlatform };
export { LocalPlatform, YouTubePlatform };
