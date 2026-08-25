import Phaser from 'phaser';
import { Theme, fontScale, toCss } from './theme';

export interface TextOptions {
  size?: number;
  color?: number;
  font?: 'display' | 'body';
  align?: 'left' | 'center' | 'right';
  origin?: [number, number];
  wrap?: number;
  letterSpacing?: number;
  alpha?: number;
}

/**
 * Shared scene behaviour: responsive layout, text helpers and toasts.
 *
 * Every screen is rebuilt on resize rather than scaled, so the game reads well
 * on any aspect ratio from a tall phone to a wide desktop window.
 */
export abstract class BaseScene extends Phaser.Scene {
  protected toastLayer!: Phaser.GameObjects.Container;
  private toasts: Phaser.GameObjects.Container[] = [];
  private resizeHandler?: (size: Phaser.Structs.Size) => void;

  get W(): number {
    return this.scale.gameSize.width;
  }

  get H(): number {
    return this.scale.gameSize.height;
  }

  get isPortrait(): boolean {
    return this.H >= this.W;
  }

  /** Font scale for the current viewport. */
  fs(size: number): number {
    return Math.round(size * fontScale(Math.min(this.W, this.H * 0.72)));
  }

  /** Registers responsive relayout. Call at the end of create(). */
  protected enableResponsiveLayout(): void {
    this.resizeHandler = () => {
      if (!this.scene.isActive()) return;
      this.layout();
    };
    this.scale.on('resize', this.resizeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.resizeHandler) this.scale.off('resize', this.resizeHandler);
    });
  }

  /** Rebuild the screen for the current size. Default: restart the scene. */
  protected layout(): void {
    this.scene.restart();
  }

  label(x: number, y: number, value: string, options: TextOptions = {}): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: options.font === 'body' ? Theme.font.body : Theme.font.display,
      fontSize: `${this.fs(options.size ?? 18)}px`,
      color: toCss(options.color ?? Theme.color.text),
      align: options.align ?? 'left',
    };
    if (options.wrap) style.wordWrap = { width: options.wrap, useAdvancedWrap: true };
    const text = this.add.text(x, y, value, style);
    if (options.letterSpacing) text.setLetterSpacing(options.letterSpacing);
    const origin = options.origin ?? [0, 0];
    text.setOrigin(origin[0], origin[1]);
    if (options.alpha !== undefined) text.setAlpha(options.alpha);
    return text;
  }

  /** Solid themed background with a soft glow behind the title area. */
  protected paintBackground(color: number = Theme.color.bg, accent?: number): void {
    this.cameras.main.setBackgroundColor(color);
    if (accent === undefined) return;
    // Stacked translucent circles approximate a radial gradient without a
    // texture, and without the hard edge a single circle would leave.
    const g = this.add.graphics().setDepth(-100);
    const radius = Math.max(this.W, this.H) * 0.62;
    const steps = 12;
    for (let i = steps; i > 0; i--) {
      g.fillStyle(accent, 0.014);
      g.fillCircle(this.W * 0.5, this.H * 0.14, (radius * i) / steps);
    }
  }

  protected ensureToastLayer(): void {
    if (this.toastLayer && this.toastLayer.active) return;
    this.toastLayer = this.add.container(0, 0).setDepth(9000);
  }

  /** Transient message. Stacks upward so several can be shown at once. */
  toast(message: string, tone: 'gold' | 'good' | 'bad' = 'gold'): void {
    this.ensureToastLayer();
    const color = tone === 'good' ? Theme.color.good : tone === 'bad' ? Theme.color.bad : Theme.color.goldBright;
    const container = this.add.container(this.W / 2, this.H - this.fs(120));
    const text = this.label(0, 0, message, {
      size: 15,
      color,
      font: 'body',
      align: 'center',
      origin: [0.5, 0.5],
      wrap: this.W * 0.8,
    });
    const padX = 18;
    const padY = 10;
    const bg = this.add.graphics();
    bg.fillStyle(Theme.color.panel, 0.96);
    bg.fillRoundedRect(
      -text.width / 2 - padX,
      -text.height / 2 - padY,
      text.width + padX * 2,
      text.height + padY * 2,
      8,
    );
    bg.lineStyle(1, Theme.color.border, 1);
    bg.strokeRoundedRect(
      -text.width / 2 - padX,
      -text.height / 2 - padY,
      text.width + padX * 2,
      text.height + padY * 2,
      8,
    );
    container.add([bg, text]);
    this.toastLayer.add(container);

    for (const existing of this.toasts) {
      existing.y -= text.height + 22;
    }
    this.toasts.push(container);

    this.tweens.add({
      targets: container,
      alpha: { from: 0, to: 1 },
      y: container.y - 12,
      duration: 180,
      ease: 'Quad.easeOut',
    });
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: container,
        alpha: 0,
        duration: 260,
        onComplete: () => {
          this.toasts = this.toasts.filter((t) => t !== container);
          container.destroy();
        },
      });
    });
  }

  /** Cross-fade to another scene. */
  goto(key: string, data?: object): void {
    this.cameras.main.fadeOut(160, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(key, data);
    });
  }

  protected fadeIn(): void {
    this.cameras.main.fadeIn(180, 0, 0, 0);
  }
}
