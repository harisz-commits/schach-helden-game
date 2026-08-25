import { DEBUG_ENABLED } from './DebugPanel';

export interface DevBridgeApi {
  /** Name of the scene that registered the current handlers. */
  scene: string;
  [key: string]: unknown;
}

/**
 * Development-only hook.
 *
 * Exposes a tiny scripting surface on `window.__crownbound` so the game can be
 * driven from the console or from an automated smoke test without depending on
 * pixel coordinates. Stripped from production builds.
 */
export function registerDevBridge(api: DevBridgeApi): void {
  if (!DEBUG_ENABLED || typeof window === 'undefined') return;
  (window as unknown as { __crownbound?: DevBridgeApi }).__crownbound = api;
}

export function clearDevBridge(scene: string): void {
  if (!DEBUG_ENABLED || typeof window === 'undefined') return;
  const holder = window as unknown as { __crownbound?: DevBridgeApi };
  if (holder.__crownbound?.scene === scene) delete holder.__crownbound;
}
