import Phaser from 'phaser';
import { Theme, textResolution, toCss } from '../theme';
import { Button } from '../components/Button';
import { drawPanel } from '../components/Panel';

export interface ModalAction {
  label: string;
  sublabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  enabled?: boolean;
  onClick: () => void;
}

export interface ModalOptions {
  title: string;
  body?: string;
  /** Lines rendered in a smaller, dimmer style under the body. */
  notes?: string[];
  actions: ModalAction[];
  accent?: number;
  /** Tapping the dimmed backdrop closes the modal. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Extra content drawn inside the panel; receives the usable width. */
  build?: (container: Phaser.GameObjects.Container, width: number, yStart: number) => number;
  maxWidth?: number;
}

/**
 * A centred dialog with a dimmed backdrop.
 *
 * Used for tile results, events, merchants, army pickers and confirmations, so
 * every interruption in the game reads the same way.
 */
export const MODAL_NAME = '__crownbound_modal';

export class Modal extends Phaser.GameObjects.Container {
  private panelG: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, options: ModalOptions) {
    super(scene, 0, 0);
    this.setDepth(8000);
    this.setName(MODAL_NAME);

    const W = scene.scale.gameSize.width;
    const H = scene.scale.gameSize.height;
    const scale = Math.max(0.85, Math.min(1.4, Math.min(W, H * 0.72) / 620));
    const fs = (n: number) => Math.round(n * scale);

    const backdrop = scene.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.72)
      .setInteractive({ useHandCursor: false });
    backdrop.on('pointerdown', () => {
      if (options.dismissible) {
        options.onDismiss?.();
        this.close();
      }
    });
    this.add(backdrop);

    const panelWidth = Math.min(options.maxWidth ?? 560, W - 32);
    const content = scene.add.container(W / 2, 0);
    this.add(content);

    this.panelG = scene.add.graphics();
    content.add(this.panelG);

    let y = 0;
    const title = scene.add
      .text(0, y, options.title, {
        fontFamily: Theme.font.display,
        fontStyle: 'bold',
        fontSize: `${fs(24)}px`,
        color: toCss(options.accent ?? Theme.color.goldBright),
        align: 'center',
        resolution: textResolution(),
        wordWrap: { width: panelWidth - 48 },
      })
      .setOrigin(0.5, 0);
    content.add(title);
    y += title.height + fs(14);

    if (options.body) {
      const body = scene.add
        .text(0, y, options.body, {
          fontFamily: Theme.font.body,
          fontStyle: '500',
          fontSize: `${fs(15)}px`,
          color: toCss(Theme.color.text),
          align: 'center',
          resolution: textResolution(),
          lineSpacing: 5,
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5, 0);
      content.add(body);
      y += body.height + fs(12);
    }

    for (const note of options.notes ?? []) {
      const line = scene.add
        .text(0, y, note, {
          fontFamily: Theme.font.body,
          fontSize: `${fs(13)}px`,
          color: toCss(Theme.color.textDim),
          align: 'center',
          resolution: textResolution(),
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5, 0);
      content.add(line);
      y += line.height + fs(5);
    }

    if (options.build) {
      y += fs(6);
      y = options.build(content, panelWidth - 40, y);
    }

    y += fs(10);
    const buttonHeight = Math.max(Theme.touch, fs(48));
    for (const action of options.actions) {
      const button = new Button(scene, 0, y + buttonHeight / 2, {
        width: panelWidth - 48,
        height: buttonHeight,
        label: action.label,
        ...(action.sublabel ? { sublabel: action.sublabel } : {}),
        variant: action.variant ?? 'secondary',
        enabled: action.enabled !== false,
        fontSize: fs(17),
        onClick: () => {
          action.onClick();
        },
      });
      content.add(button);
      y += buttonHeight + fs(10);
    }

    const panelHeight = y + fs(18);
    const top = Math.max(fs(20), (H - panelHeight) / 2);
    content.y = top + fs(24);
    drawPanel(this.panelG, {
      width: panelWidth,
      height: panelHeight + fs(20),
      fill: Theme.color.panel,
      border: options.accent ?? Theme.color.border,
      radius: 14,
      inset: true,
    });
    this.panelG.y = panelHeight / 2 - fs(14);

    scene.add.existing(this);
    this.setAlpha(0);
    scene.tweens.add({ targets: this, alpha: 1, duration: 140 });
    content.setScale(0.96);
    scene.tweens.add({ targets: content, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  close(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 120,
      onComplete: () => this.destroy(),
    });
  }
}

/** Convenience helper so scenes can open a modal in one call. */
export function showModal(scene: Phaser.Scene, options: ModalOptions): Modal {
  return new Modal(scene, options);
}

/** Closes the top-most open modal in a scene. */
export function closeTopModal(scene: Phaser.Scene): void {
  const modals = scene.children.list.filter((child) => child.name === MODAL_NAME);
  const top = modals[modals.length - 1] as Modal | undefined;
  top?.close();
}
