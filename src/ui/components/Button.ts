import Phaser from 'phaser';
import { Theme, textResolution, toCss } from '../theme';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  /** Secondary line rendered under the label. */
  sublabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  fontSize?: number;
  onClick: () => void;
  enabled?: boolean;
}

/**
 * A tappable button. Touch-first: no hover is required for any state, but
 * pointer devices get a hover highlight anyway.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text;
  private subText: Phaser.GameObjects.Text | null = null;
  private opts: ButtonOptions;
  private hovered = false;
  private pressed = false;
  private downAt = { x: 0, y: 0 };
  private _enabled: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    this.opts = options;
    this._enabled = options.enabled !== false;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    const size = options.fontSize ?? Math.round(options.height * 0.36);
    this.labelText = scene.add
      .text(0, options.sublabel ? -options.height * 0.14 : 0, options.label, {
        fontFamily: Theme.font.display,
        fontStyle: 'bold',
        fontSize: `${size}px`,
        color: toCss(Theme.color.text),
        align: 'center',
        resolution: textResolution(),
        wordWrap: { width: options.width - 20 },
      })
      .setOrigin(0.5);
    this.add(this.labelText);

    if (options.sublabel) {
      this.subText = scene.add
        .text(0, options.height * 0.2, options.sublabel, {
          fontFamily: Theme.font.body,
          fontStyle: '500',
          fontSize: `${Math.round(size * 0.66)}px`,
          color: toCss(Theme.color.textDim),
          align: 'center',
          resolution: textResolution(),
          wordWrap: { width: options.width - 20 },
        })
        .setOrigin(0.5);
      this.add(this.subText);
    }

    this.setSize(options.width, options.height);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-options.width / 2, -options.height / 2, options.width, options.height),
      Phaser.Geom.Rectangle.Contains,
    );

    this.on('pointerover', () => {
      this.hovered = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this._enabled) return;
      this.pressed = true;
      this.downAt = { x: pointer.x, y: pointer.y };
      this.redraw();
    });
    // Cancel the press when the finger travels - that gesture is a scroll.
    this.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.pressed) return;
      const dx = pointer.x - this.downAt.x;
      const dy = pointer.y - this.downAt.y;
      if (Math.hypot(dx, dy) > 12) {
        this.pressed = false;
        this.redraw();
      }
    });
    this.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.redraw();
      if (this._enabled && wasPressed) this.opts.onClick();
    });

    this.redraw();
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    this.redraw();
    return this;
  }

  get isEnabled(): boolean {
    return this._enabled;
  }

  setLabel(label: string, sublabel?: string): this {
    this.labelText.setText(label);
    if (this.subText && sublabel !== undefined) this.subText.setText(sublabel);
    return this;
  }

  private palette(): { fill: number; border: number; text: number } {
    const variant = this.opts.variant ?? 'primary';
    if (!this._enabled) {
      return { fill: Theme.color.panel, border: Theme.color.border, text: Theme.color.textFaint };
    }
    switch (variant) {
      case 'primary':
        return {
          fill: this.pressed ? Theme.color.goldDim : this.hovered ? Theme.color.panelHi : Theme.color.panelLight,
          border: Theme.color.gold,
          text: Theme.color.goldBright,
        };
      case 'danger':
        return {
          fill: this.pressed ? 0x50201a : Theme.color.panelLight,
          border: Theme.color.bad,
          text: this.hovered ? 0xffb9ac : Theme.color.text,
        };
      case 'ghost':
        return {
          fill: this.pressed || this.hovered ? Theme.color.panel : Theme.color.bg,
          border: Theme.color.border,
          text: Theme.color.textDim,
        };
      case 'secondary':
      default:
        return {
          fill: this.pressed ? Theme.color.panelHi : Theme.color.panel,
          border: Theme.color.borderBright,
          text: Theme.color.text,
        };
    }
  }

  private redraw(): void {
    const { width, height } = this.opts;
    const { fill, border, text } = this.palette();
    this.bg.clear();
    this.bg.fillStyle(fill, 1);
    this.bg.fillRoundedRect(-width / 2, -height / 2, width, height, Theme.radius);
    this.bg.lineStyle(2, border, this._enabled ? 1 : 0.5);
    this.bg.strokeRoundedRect(-width / 2, -height / 2, width, height, Theme.radius);
    this.labelText.setColor(toCss(text));
    this.setAlpha(this._enabled ? 1 : 0.75);
  }
}
