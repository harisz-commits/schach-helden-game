import Phaser from 'phaser';
import { Theme } from '../theme';

export interface PanelOptions {
  width: number;
  height: number;
  fill?: number;
  border?: number;
  alpha?: number;
  radius?: number;
  /** Draws a thin inner line for a framed, parchment-card look. */
  inset?: boolean;
}

/** A framed panel used for cards, HUD blocks and modal bodies. */
export function drawPanel(g: Phaser.GameObjects.Graphics, options: PanelOptions): void {
  const {
    width,
    height,
    fill = Theme.color.panel,
    border = Theme.color.border,
    alpha = 1,
    radius = Theme.radius,
    inset = false,
  } = options;
  g.clear();
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
  g.lineStyle(2, border, 1);
  g.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
  if (inset) {
    g.lineStyle(1, border, 0.45);
    g.strokeRoundedRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, Math.max(2, radius - 4));
  }
}

export class Panel extends Phaser.GameObjects.Container {
  readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, private options: PanelOptions) {
    super(scene, x, y);
    this.graphics = scene.add.graphics();
    this.add(this.graphics);
    drawPanel(this.graphics, options);
    this.setSize(options.width, options.height);
    scene.add.existing(this);
  }

  resize(width: number, height: number): this {
    this.options = { ...this.options, width, height };
    drawPanel(this.graphics, this.options);
    this.setSize(width, height);
    return this;
  }

  restyle(options: Partial<PanelOptions>): this {
    this.options = { ...this.options, ...options };
    drawPanel(this.graphics, this.options);
    return this;
  }
}
