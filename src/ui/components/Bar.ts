import Phaser from 'phaser';
import { Theme, hpColor } from '../theme';

export interface BarOptions {
  width: number;
  height: number;
  color?: number;
  background?: number;
  border?: boolean;
  /** Second, slower bar drawn behind for recent damage. */
  ghost?: boolean;
}

/** Health / energy bar with an optional trailing "damage taken" ghost. */
export class Bar extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private value = 1;
  private ghostValue = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, private options: BarOptions) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.add(this.g);
    this.setSize(options.width, options.height);
    this.redraw();
    scene.add.existing(this);
  }

  setValue(value: number, immediate = false): this {
    this.value = Math.max(0, Math.min(1, value));
    if (immediate || this.value > this.ghostValue) this.ghostValue = this.value;
    this.redraw();
    return this;
  }

  /** Call each frame so the ghost bar catches up smoothly. */
  tick(delta: number): void {
    if (this.ghostValue > this.value) {
      this.ghostValue = Math.max(this.value, this.ghostValue - delta * 0.0009);
      this.redraw();
    }
  }

  resize(width: number, height: number): this {
    this.options = { ...this.options, width, height };
    this.setSize(width, height);
    this.redraw();
    return this;
  }

  private redraw(): void {
    const { width, height, background = Theme.color.bgAlt, border = true, ghost = true } = this.options;
    const color = this.options.color ?? hpColor(this.value);
    const r = Math.min(height / 2, 5);
    this.g.clear();
    this.g.fillStyle(background, 1);
    this.g.fillRoundedRect(-width / 2, -height / 2, width, height, r);
    if (ghost && this.ghostValue > this.value) {
      this.g.fillStyle(Theme.color.bad, 0.55);
      this.g.fillRoundedRect(-width / 2, -height / 2, width * this.ghostValue, height, r);
    }
    if (this.value > 0) {
      this.g.fillStyle(color, 1);
      this.g.fillRoundedRect(-width / 2, -height / 2, Math.max(3, width * this.value), height, r);
    }
    if (border) {
      this.g.lineStyle(1, Theme.color.border, 0.9);
      this.g.strokeRoundedRect(-width / 2, -height / 2, width, height, r);
    }
  }
}
