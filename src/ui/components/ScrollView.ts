import Phaser from 'phaser';

/**
 * Vertical scroll container with touch drag, momentum and wheel support.
 *
 * Buttons inside cancel their own press once the finger travels, so dragging
 * over a button scrolls instead of activating it.
 */
export class ScrollView extends Phaser.GameObjects.Container {
  readonly content: Phaser.GameObjects.Container;

  private viewportWidth: number;
  private viewportHeight: number;
  private contentHeight = 0;
  private dragging = false;
  private lastPointerY = 0;
  private velocity = 0;
  private maskGraphics: Phaser.GameObjects.Graphics;
  private hitArea: Phaser.GameObjects.Rectangle;
  private scrollbar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y);
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.hitArea = scene.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ draggable: false });
    this.add(this.hitArea);

    this.content = scene.add.container(0, 0);
    this.add(this.content);

    this.scrollbar = scene.add.graphics();
    this.add(this.scrollbar);

    this.maskGraphics = scene.make.graphics({ x: 0, y: 0 }, false);
    this.applyMask();

    this.hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.lastPointerY = pointer.y;
      this.velocity = 0;
    });

    const move = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const delta = pointer.y - this.lastPointerY;
      this.lastPointerY = pointer.y;
      this.velocity = delta;
      this.scrollBy(delta);
    };
    const end = () => {
      this.dragging = false;
    };
    scene.input.on('pointermove', move);
    scene.input.on('pointerup', end);
    scene.input.on('pointerupoutside', end);

    const wheel = (
      _pointer: Phaser.Input.Pointer,
      _objects: unknown,
      _dx: number,
      dy: number,
    ) => {
      const bounds = this.getViewportBounds();
      const p = scene.input.activePointer;
      if (p.x < bounds.x || p.x > bounds.x + this.viewportWidth) return;
      if (p.y < bounds.y || p.y > bounds.y + this.viewportHeight) return;
      this.scrollBy(-dy * 0.6);
    };
    scene.input.on('wheel', wheel);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', end);
      scene.input.off('pointerupoutside', end);
      scene.input.off('wheel', wheel);
      this.maskGraphics.destroy();
    });

    scene.add.existing(this);
  }

  private getViewportBounds(): { x: number; y: number } {
    const matrix = this.getWorldTransformMatrix();
    return { x: matrix.tx, y: matrix.ty };
  }

  private applyMask(): void {
    const bounds = this.getViewportBounds();
    this.maskGraphics.clear();
    this.maskGraphics.fillStyle(0xffffff);
    this.maskGraphics.fillRect(bounds.x, bounds.y, this.viewportWidth, this.viewportHeight);
    this.content.setMask(this.maskGraphics.createGeometryMask());
  }

  setContentHeight(height: number): this {
    this.contentHeight = height;
    this.clamp();
    this.drawScrollbar();
    return this;
  }

  resizeViewport(width: number, height: number): this {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.hitArea.setSize(width, height);
    this.hitArea.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    this.applyMask();
    this.clamp();
    return this;
  }

  scrollBy(delta: number): void {
    this.content.y += delta;
    this.clamp();
    this.drawScrollbar();
  }

  scrollTo(offset: number): void {
    this.content.y = -offset;
    this.clamp();
    this.drawScrollbar();
  }

  private clamp(): void {
    const min = Math.min(0, this.viewportHeight - this.contentHeight);
    this.content.y = Phaser.Math.Clamp(this.content.y, min, 0);
  }

  /** Call from the scene's update loop for momentum. */
  tick(): void {
    if (this.dragging || Math.abs(this.velocity) < 0.4) return;
    this.velocity *= 0.92;
    this.scrollBy(this.velocity);
  }

  private drawScrollbar(): void {
    this.scrollbar.clear();
    if (this.contentHeight <= this.viewportHeight) return;
    const trackHeight = this.viewportHeight;
    const thumbHeight = Math.max(28, (this.viewportHeight / this.contentHeight) * trackHeight);
    const maxScroll = this.contentHeight - this.viewportHeight;
    const progress = maxScroll > 0 ? -this.content.y / maxScroll : 0;
    const thumbY = progress * (trackHeight - thumbHeight);
    this.scrollbar.fillStyle(0xffffff, 0.14);
    this.scrollbar.fillRoundedRect(this.viewportWidth - 5, thumbY, 3, thumbHeight, 2);
  }

  /** Recomputes the mask after the container has moved. */
  refreshMask(): void {
    this.applyMask();
  }
}
