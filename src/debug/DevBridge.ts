import type Phaser from 'phaser';
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
export function registerDevBridge(scene: Phaser.Scene, api: DevBridgeApi): void {
  if (!DEBUG_ENABLED || typeof window === 'undefined') return;
  (window as unknown as { __crownbound?: DevBridgeApi }).__crownbound = {
    ...api,
    /**
     * Screen position of the first visible label containing `text`.
     *
     * Lets a console session or a smoke test drive real buttons and modals
     * through the actual input pipeline instead of guessing coordinates.
     */
    findLabel: (needle: string) => findLabel(scene, needle),
    labels: () => collectTexts(scene.children.list).map((t) => t.text),
  };
}

type TextLike = Phaser.GameObjects.Text;

function collectTexts(list: Phaser.GameObjects.GameObject[]): TextLike[] {
  const out: TextLike[] = [];
  for (const child of list) {
    const asText = child as TextLike;
    if (typeof asText.text === 'string' && asText.type === 'Text') {
      out.push(asText);
      continue;
    }
    const asContainer = child as Phaser.GameObjects.Container;
    if (Array.isArray(asContainer.list)) out.push(...collectTexts(asContainer.list));
  }
  return out;
}

function findLabel(scene: Phaser.Scene, needle: string): { x: number; y: number; text: string } | null {
  const wanted = needle.toLowerCase();
  // Later entries are drawn on top (modals over the screen behind them).
  const matches = collectTexts(scene.children.list).filter(
    (t) => t.visible && t.text.toLowerCase().includes(wanted),
  );
  const target = matches[matches.length - 1];
  if (!target) return null;
  const matrix = target.getWorldTransformMatrix();
  return {
    x: matrix.tx + (0.5 - target.originX) * target.displayWidth,
    y: matrix.ty + (0.5 - target.originY) * target.displayHeight,
    text: target.text,
  };
}

export function clearDevBridge(scene: string): void {
  if (!DEBUG_ENABLED || typeof window === 'undefined') return;
  const holder = window as unknown as { __crownbound?: DevBridgeApi };
  if (holder.__crownbound?.scene === scene) delete holder.__crownbound;
}
