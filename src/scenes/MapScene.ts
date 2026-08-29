import Phaser from 'phaser';
import type { ArmyRunState, TileData } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { Theme, hpColor } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { drawPanel } from '../ui/components/Panel';
import { closeTopModal, showModal } from '../ui/overlays/Modal';
import { TILE_DESCRIPTION, TILE_LABEL, drawTileGlyph, tileAccent } from '../ui/TileGlyphs';
import {
  TILE_RATIO,
  drawFogCloud,
  drawPedestal,
  drawTileSurface,
  isoDiamondHitArea,
  isoGridBounds,
  isoProject,
  lighten,
  strokeTileDiamond,
} from '../ui/TileTerrain';
import { session } from '../run/GameSession';
import { saveManager } from '../save/SaveManager';
import { audio } from '../audio/AudioManager';
import { BIOMES_BY_ID, biomeForFloor } from '../data/floors';
import { getHero } from '../data/heroes';
import { GameConfig } from '../core/GameConfig';
import type { ArmyChoicePurpose, RunManager } from '../run/RunManager';
import { attachDebugPanel } from '../debug/DebugPanel';
import { registerDevBridge } from '../debug/DevBridge';

interface SceneData {
  messages?: string[];
  banner?: string;
}

/** Tile types drawn as built structures standing on the ground. */
const STRUCTURE_TILES = new Set<TileData['type']>([
  'MERCHANT',
  'HEALING_FOUNTAIN',
  'SACRED_SPRING',
  'SHRINE',
  'TEMPLE',
  'ORACLE_TOWER',
  'ALTAR',
  'WAR_CAMP',
  'RECRUITMENT_CAMP',
  'RESURRECTION_SHRINE',
  'EXIT',
]);

/**
 * The exploration screen: HUD, fog-of-war grid and every non-combat
 * interaction. All game logic lives in RunManager - this scene only renders it
 * and routes taps.
 */
export class MapScene extends BaseScene {
  private manager!: RunManager;
  private gridLayer!: Phaser.GameObjects.Container;
  private hudLayer!: Phaser.GameObjects.Container;
  private pendingMessages: string[] = [];
  private pendingBanner: string | null = null;
  /** Width of a tile's diamond. Height is derived via TILE_RATIO. */
  private tileSize = 64;
  private gridOrigin = { x: 0, y: 0 };
  /** Board pan offset, clamped so the grid can never be dragged off screen. */
  private boardOffset = { x: 0, y: 0 };
  private panBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private dragging = false;
  private dragMoved = 0;
  private dragLast = { x: 0, y: 0 };
  private pulseTargets: Phaser.GameObjects.Graphics[] = [];
  /** Relic waiting for the player to pick which army it applies to. */
  private pendingRelicUid: string | null = null;

  constructor() {
    super('Map');
  }

  init(data: SceneData): void {
    this.pendingMessages = data.messages ?? [];
    this.pendingBanner = data.banner ?? null;
  }

  create(): void {
    const manager = session.runManager ?? session.resumeRun();
    if (!manager) {
      this.scene.start('MainMenu');
      return;
    }
    this.manager = manager;
    manager.tickClock();

    const biome = BIOMES_BY_ID[manager.view.data.biomeId] ?? biomeForFloor(manager.floor);
    this.paintBackground(biome.palette.background, biome.palette.accent);

    this.gridLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0).setDepth(500);

    this.drawHUD();
    this.drawGrid();
    this.centreOnAction();
    this.drawBottomBar();
    this.enableResponsiveLayout();
    this.fadeIn();

    attachDebugPanel(this, () => this.refresh());
    registerDevBridge(this, {
      scene: 'Map',
      floor: () => this.manager.floor,
      gold: () => this.manager.gold,
      armies: () => this.manager.armies.map((a) => ({ id: a.heroId, hp: a.hpRatio, alive: a.alive })),
      guardianDefeated: () => this.manager.guardianDefeated,
      /** Tiles the player can act on right now. */
      frontier: () => this.manager.fog.frontier().map((t) => ({ id: t.id, type: t.type })),
      /** Screen position of a tile, so a test can tap the real hit area. */
      tileAt: (id: string) => {
        const tile = this.manager.view.get(id);
        if (!tile) return null;
        const pos = this.tilePosition(tile);
        return { x: pos.x + this.boardOffset.x, y: pos.y + this.boardOffset.y };
      },
      /** Acts on a reachable tile, by id or by type. */
      tap: (selector: string) => {
        const frontier = this.manager.fog.frontier();
        const tile = frontier.find((t) => t.id === selector) ?? frontier.find((t) => t.type === selector);
        if (!tile) return false;
        this.onTileTapped(tile);
        return true;
      },
    });

    if (this.pendingBanner) {
      this.showBanner(this.pendingBanner);
      this.pendingBanner = null;
    }
    if (this.pendingMessages.length > 0) {
      const messages = this.pendingMessages;
      this.pendingMessages = [];
      this.time.delayedCall(140, () => this.showMessages(messages));
    } else if (this.manager.pendingReward) {
      this.time.delayedCall(120, () => this.goto('Reward', { inline: true }));
    }
  }

  override update(_time: number, delta: number): void {
    // Gentle pulse on tiles you can act on right now.
    const alpha = 0.45 + Math.sin(this.time.now / 340) * 0.32;
    for (const target of this.pulseTargets) target.setAlpha(alpha);
    void delta;
  }

  private refresh(): void {
    this.scene.restart();
  }

  /* ---------------------------------------------------------------- */
  /* HUD                                                               */
  /* ---------------------------------------------------------------- */

  /** Never let the HUD touch the top edge - notches and rounded corners eat it. */
  private get safeTop(): number {
    return Math.max(this.fs(8), 10);
  }

  private get hudHeight(): number {
    const rows = Math.ceil(this.manager.armies.length / (this.W > this.fs(560) ? 5 : 3));
    return this.safeTop + this.fs(54) + rows * this.fs(40);
  }

  private drawHUD(): void {
    const run = this.manager.run;
    const biome = BIOMES_BY_ID[this.manager.view.data.biomeId] ?? biomeForFloor(this.manager.floor);
    const pad = this.fs(12);

    const bg = this.add.graphics();
    bg.fillStyle(Theme.color.bg, 0.86);
    bg.fillRect(0, 0, this.W, this.hudHeight);
    bg.lineStyle(1, Theme.color.border, 0.8);
    bg.lineBetween(0, this.hudHeight, this.W, this.hudHeight);
    this.hudLayer.add(bg);

    const totalFloors = run.mode === 'ENDLESS' ? '∞' : `${GameConfig.run.totalFloors}`;
    this.hudLayer.add(
      this.label(pad, this.safeTop + this.fs(6), `FLOOR ${run.floor} / ${totalFloors}`, {
        size: 17,
        color: Theme.color.goldBright,
        letterSpacing: 2,
      }),
    );
    this.hudLayer.add(
      this.label(pad, this.safeTop + this.fs(28), biome.name.toUpperCase(), {
        size: 10,
        color: Theme.color.textFaint,
        font: 'body',
        letterSpacing: 3,
      }),
    );

    // Guardian status - the player must always know what is left to do.
    const guardianText = this.manager.guardianDefeated ? 'GUARDIAN DEFEATED · EXIT OPEN' : 'GUARDIAN AWAITS';
    this.hudLayer.add(
      this.label(this.W - pad, this.safeTop + this.fs(28), guardianText, {
        size: 10,
        color: this.manager.guardianDefeated ? Theme.color.good : Theme.color.warn,
        font: 'body',
        origin: [1, 0],
        letterSpacing: 2,
      }),
    );

    const menu = new Button(this, this.W - pad - this.fs(28), this.safeTop + this.fs(14), {
      width: this.fs(56),
      height: this.fs(28),
      label: 'MENU',
      variant: 'ghost',
      fontSize: this.fs(11),
      onClick: () => this.openMenu(),
    });
    this.hudLayer.add(menu);

    this.drawArmyStrip();
  }

  private drawArmyStrip(): void {
    const armies = this.manager.armies;
    const perRow = this.W > this.fs(560) ? 5 : 3;
    const pad = this.fs(10);
    const cardWidth = (this.W - pad * 2 - (perRow - 1) * this.fs(6)) / perRow;
    const cardHeight = this.fs(36);
    const top = this.safeTop + this.fs(48);

    armies.forEach((army, index) => {
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const x = pad + column * (cardWidth + this.fs(6));
      const y = top + row * (cardHeight + this.fs(4));
      this.hudLayer.add(this.buildArmyChip(army, x, y, cardWidth, cardHeight));
    });
  }

  private buildArmyChip(
    army: ArmyRunState,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x + width / 2, y + height / 2);
    const hero = getHero(army.heroId);
    const ratio = army.alive ? army.hpRatio : 0;

    const g = this.add.graphics();
    drawPanel(g, {
      width,
      height,
      fill: army.alive ? Theme.color.panel : 0x1a1414,
      border: army.alive ? Theme.color.border : Theme.color.bad,
      radius: 7,
    });
    container.add(g);

    container.add(
      this.label(-width / 2 + this.fs(8), -height / 2 + this.fs(5), hero.name.toUpperCase(), {
        size: 11,
        color: army.alive ? Theme.color.text : Theme.color.textFaint,
        letterSpacing: 1,
      }),
    );
    container.add(
      this.label(width / 2 - this.fs(8), -height / 2 + this.fs(5), army.alive ? `${Math.round(ratio * 100)}%` : 'FALLEN', {
        size: 11,
        color: army.alive ? hpColor(ratio) : Theme.color.bad,
        font: 'body',
        origin: [1, 0],
      }),
    );

    const barWidth = width - this.fs(16);
    const bar = this.add.graphics();
    bar.fillStyle(Theme.color.bgAlt, 1);
    bar.fillRoundedRect(-barWidth / 2, height / 2 - this.fs(12), barWidth, this.fs(5), 2);
    if (ratio > 0) {
      bar.fillStyle(hpColor(ratio), 1);
      bar.fillRoundedRect(-barWidth / 2, height / 2 - this.fs(12), Math.max(2, barWidth * ratio), this.fs(5), 2);
    }
    container.add(bar);

    const hit = this.add.rectangle(0, 0, width, height, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.showArmyDetails(army));
    container.add(hit);
    return container;
  }

  private showArmyDetails(army: ArmyRunState): void {
    const hero = getHero(army.heroId);
    const stats = this.manager.armyStats(army);
    const tier = session.profile.heroMastery[hero.id]?.tier ?? 1;
    showModal(this, {
      title: hero.name,
      body: `${hero.heroClass}${hero.secondaryClass ? ` / ${hero.secondaryClass}` : ''}  ·  ${army.row === 'FRONT' ? 'Front' : 'Back'} row  ·  Mastery ${tier}`,
      notes: [
        army.alive ? `${Math.round(army.hpRatio * 100)}% of ${Math.round(stats.maxHP).toLocaleString()} HP` : 'This army has fallen.',
        `Attack ${Math.round(stats.attack)}   Defense ${Math.round(stats.defense)}   Speed ${stats.attackSpeed.toFixed(2)}/s`,
        `${hero.activeSkill.name}: ${hero.activeSkill.description}`,
        ...hero.passiveSkills.map((p) => `${p.name}: ${p.description}`),
        ...(army.lieutenantId ? [`Lieutenant: ${getHero(army.lieutenantId).name}`] : []),
        ...(army.temporary ? ['Mercenary - leaves at the end of this floor.'] : []),
      ],
      dismissible: true,
      actions: [{ label: 'CLOSE', variant: 'ghost', onClick: () => this.closeTopModal() }],
    });
  }

  /* ---------------------------------------------------------------- */
  /* Grid                                                              */
  /* ---------------------------------------------------------------- */

  private get bottomBarHeight(): number {
    return Math.max(this.fs(82), 72);
  }

  private drawGrid(): void {
    this.gridLayer.removeAll(true);
    this.pulseTargets = [];

    const view = this.manager.view;
    const top = this.hudHeight + this.fs(6);
    const bottom = this.H - this.bottomBarHeight - this.fs(6);
    const availableWidth = this.W - this.fs(12);
    const availableHeight = bottom - top;

    // Fit the whole floor when it will fit at a readable size; otherwise keep
    // tiles legible and let the player pan, which is how the reference handles
    // large floors on a phone.
    const spanUnits = (view.width + view.height) / 2;
    const fitByHeight = availableHeight / (spanUnits * TILE_RATIO + 1);
    const minTile = Math.max(46, this.fs(52));
    const maxTile = this.fs(120);
    this.tileSize = Math.max(minTile, Math.min(maxTile, fitByHeight));

    const bounds = isoGridBounds(view.width, view.height, this.tileSize);
    const gridWidth = bounds.maxX - bounds.minX;
    const gridHeight = bounds.maxY - bounds.minY;

    // Anchor so projected (0,0) lands where the grid's top-left corner should.
    this.gridOrigin = {
      x: this.W / 2 - (bounds.minX + bounds.maxX) / 2,
      y: top + availableHeight / 2 - (bounds.minY + bounds.maxY) / 2,
    };

    // How far the board may travel before the grid leaves the viewport.
    const slackX = Math.max(0, (gridWidth - availableWidth) / 2);
    const slackY = Math.max(0, (gridHeight - availableHeight) / 2);
    this.panBounds = { minX: -slackX, maxX: slackX, minY: -slackY, maxY: slackY };
    this.boardOffset = {
      x: Phaser.Math.Clamp(this.boardOffset.x, this.panBounds.minX, this.panBounds.maxX),
      y: Phaser.Math.Clamp(this.boardOffset.y, this.panBounds.minY, this.panBounds.maxY),
    };

    // Back to front, so tiles nearer the camera overlap the ones behind them.
    const ordered = [...view.tiles].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const tile of ordered) {
      const cell = this.buildTile(tile);
      if (cell) this.gridLayer.add(cell);
    }

    this.gridLayer.setPosition(this.boardOffset.x, this.boardOffset.y);
    this.enableBoardPan(gridWidth > availableWidth || gridHeight > availableHeight);
  }

  /**
   * Drag-to-pan for floors too large to fit. The gridLayer moves as a whole;
   * tiles keep their own tap handling and simply ignore taps that travelled.
   */
  private enableBoardPan(needed: boolean): void {
    if (!needed) return;
    const onDown = (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.dragLast = { x: pointer.x, y: pointer.y };
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const dx = pointer.x - this.dragLast.x;
      const dy = pointer.y - this.dragLast.y;
      this.dragLast = { x: pointer.x, y: pointer.y };
      this.dragMoved += Math.hypot(dx, dy);
      this.boardOffset.x = Phaser.Math.Clamp(this.boardOffset.x + dx, this.panBounds.minX, this.panBounds.maxX);
      this.boardOffset.y = Phaser.Math.Clamp(this.boardOffset.y + dy, this.panBounds.minY, this.panBounds.maxY);
      this.gridLayer.setPosition(this.boardOffset.x, this.boardOffset.y);
    };
    const onUp = () => {
      this.dragging = false;
    };
    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.input.on('pointerupoutside', onUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
      this.input.off('pointerupoutside', onUp);
    });
  }

  /**
   * Centres the board on the tiles the player can act on, falling back to the
   * landing site. On a panned floor this keeps the live edge of the expedition
   * on screen instead of parking the view over explored ground.
   */
  private centreOnAction(): void {
    const frontier = this.manager.fog.frontier();
    const focus = frontier.length > 0 ? frontier : [this.manager.view.start];
    const avg = focus.reduce(
      (acc, tile) => {
        const p = this.tilePosition(tile);
        return { x: acc.x + p.x / focus.length, y: acc.y + p.y / focus.length };
      },
      { x: 0, y: 0 },
    );
    this.centreOnPoint(avg);
  }

  /** Brings a point into view, clamped to the board's pan limits. */
  private centreOnPoint(pos: { x: number; y: number }): void {
    const targetX = this.W / 2 - pos.x;
    const targetY = (this.hudHeight + this.H - this.bottomBarHeight) / 2 - pos.y;
    this.boardOffset = {
      x: Phaser.Math.Clamp(targetX, this.panBounds.minX, this.panBounds.maxX),
      y: Phaser.Math.Clamp(targetY, this.panBounds.minY, this.panBounds.maxY),
    };
    this.gridLayer.setPosition(this.boardOffset.x, this.boardOffset.y);
  }

  private tilePosition(tile: TileData): { x: number; y: number } {
    const projected = isoProject(tile.x, tile.y, this.tileSize);
    return { x: this.gridOrigin.x + projected.x, y: this.gridOrigin.y + projected.y };
  }

  private buildTile(tile: TileData): Phaser.GameObjects.Container | null {
    if (tile.type === 'BLOCKED') return null;
    const biome = BIOMES_BY_ID[this.manager.view.data.biomeId] ?? biomeForFloor(this.manager.floor);
    const pos = this.tilePosition(tile);
    const container = this.add.container(pos.x, pos.y);
    const size = this.tileSize;

    const interactable = this.manager.canInteract(tile.id);
    const known = tile.state !== 'HIDDEN' || tile.scouted;
    const cleared = tile.state === 'CLEARED';
    const exitLocked = tile.type === 'EXIT' && !this.manager.guardianDefeated;

    const g = this.add.graphics();
    drawTileSurface(g, tile, { size, biome, known, cleared, active: interactable });
    container.add(g);

    if (!known) {
      // Unexplored ground stays under cloud until the fog front reaches it.
      const fog = this.add.graphics();
      drawFogCloud(fog, tile, size, biome);
      container.add(fog);
      container.add(this.buildTileHitArea(tile, size));
      return container;
    }

    // Structures stand on a pedestal so they read as buildings on ground,
    // rather than icons floating on a coloured square.
    if (!cleared && STRUCTURE_TILES.has(tile.type)) {
      const base = this.add.graphics();
      drawPedestal(base, size, biome);
      container.add(base);
    }

    // Content stands up out of the tile rather than lying flat on it, which is
    // what makes the board read as a world seen at an angle.
    const glyphSize = size * 0.5;
    const glyphY = -size * TILE_RATIO * 0.34;
    const accent = tileAccent(tile.type);
    if (!cleared) {
      const shadow = this.add.graphics();
      drawTileGlyph(shadow, tile.type, glyphSize, 0x000000);
      shadow.setAlpha(0.32).setPosition(size * 0.03, glyphY + size * 0.05);
      container.add(shadow);
    }
    const glyph = this.add.graphics();
    drawTileGlyph(
      glyph,
      cleared ? 'EMPTY' : tile.type,
      glyphSize,
      cleared ? Theme.color.textFaint : lighten(accent, 0.12),
    );
    glyph.setPosition(0, cleared ? 0 : glyphY);
    glyph.setAlpha(cleared ? 0.4 : tile.state === 'REVEALED' || tile.scouted ? 1 : 0.5);
    container.add(glyph);

    if (cleared && tile.id === this.manager.view.data.startTileId) {
      const start = this.add.graphics();
      drawTileGlyph(start, 'START', size * 0.42, Theme.color.goldDim);
      container.add(start);
    }

    // Scouted but out of reach: dim and desaturate.
    if (tile.state === 'HIDDEN' && tile.scouted) {
      container.setAlpha(0.5);
    }

    if (interactable && !exitLocked) {
      const ring = this.add.graphics();
      strokeTileDiamond(ring, size, Theme.color.goldBright, Math.max(2, size * 0.05));
      container.add(ring);
      this.pulseTargets.push(ring);
    } else if (exitLocked && tile.state === 'REVEALED') {
      const ring = this.add.graphics();
      strokeTileDiamond(ring, size, Theme.color.bad, Math.max(1.5, size * 0.035), 0.6);
      container.add(ring);
    }

    container.add(this.buildTileHitArea(tile, size));
    return container;
  }

  /** Diamond-shaped tap target, so taps land on the tile you actually see. */
  private buildTileHitArea(tile: TileData, size: number): Phaser.GameObjects.Zone {
    const h = size * TILE_RATIO;
    const zone = this.add.zone(0, 0, size, h);
    zone.setInteractive(new Phaser.Geom.Polygon(isoDiamondHitArea(size)), Phaser.Geom.Polygon.Contains);
    let downAt = { x: 0, y: 0 };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y };
    });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      // A tap that travelled was a pan of the board, not a choice of tile.
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 14) return;
      if (this.dragMoved > 14) return;
      this.onTileTapped(tile);
    });
    return zone;
  }

  private onTileTapped(tile: TileData): void {
    if (!this.manager.canInteract(tile.id)) {
      const known = tile.state !== 'HIDDEN' || tile.scouted;
      if (!known) {
        this.toast('Still hidden in the fog.');
        return;
      }
      const locked = tile.type === 'EXIT' && !this.manager.guardianDefeated;
      showModal(this, {
        title: TILE_LABEL[tile.type],
        body: locked
          ? 'The way out stays sealed until this floor\'s Guardian falls.'
          : TILE_DESCRIPTION[tile.type] ?? 'You cannot reach this yet.',
        notes: locked ? [] : ['Clear a path to it first.'],
        dismissible: true,
        accent: tileAccent(tile.type),
        actions: [{ label: 'CLOSE', variant: 'ghost', onClick: () => this.closeTopModal() }],
      });
      return;
    }

    audio.play('click');
    const result = this.manager.interact(tile.id);

    switch (result.kind) {
      case 'BATTLE':
        this.goto('Battle', { tileId: tile.id, encounterId: result.encounter.id });
        break;
      case 'EVENT':
        this.openEvent(tile.id, result.event);
        break;
      case 'MERCHANT':
        this.openMerchant(tile.id);
        break;
      case 'BLESSING':
        this.manager.queueBlessingOffer(result.rarity);
        this.manager.fog.clearTile(tile);
        this.goto('Reward', { inline: true });
        break;
      case 'CHOOSE_ARMY':
        this.openArmyChoice(tile.id, result.purpose);
        break;
      case 'EXIT':
        this.leaveFloor();
        break;
      case 'RESOLVED':
        this.refreshAfterInteraction(result.messages);
        break;
      case 'BLOCKED':
        this.toast(result.reason, 'bad');
        break;
    }
  }

  private refreshAfterInteraction(messages: string[]): void {
    saveManager.requestSave();
    if (this.manager.isRunLost()) {
      session.endRun(false);
      this.goto('RunEnd', { won: false });
      return;
    }
    if (this.manager.pendingReward) {
      this.pendingMessages = messages;
      this.goto('Reward', { inline: true });
      return;
    }
    this.scene.restart({ messages });
  }

  private showMessages(messages: string[]): void {
    if (messages.length === 0) return;
    if (messages.length === 1) {
      this.toast(messages[0]!);
      return;
    }
    showModal(this, {
      title: 'The expedition presses on',
      notes: messages,
      dismissible: true,
      actions: [{ label: 'CONTINUE', variant: 'primary', onClick: () => this.closeTopModal() }],
    });
  }

  /* ---------------------------------------------------------------- */
  /* Interactions                                                      */
  /* ---------------------------------------------------------------- */

  private openEvent(tileId: string, event: { id: string; name: string; description: string; choices: import('../core/types').EventChoice[] }): void {
    showModal(this, {
      title: event.name,
      body: event.description,
      accent: Theme.color.warn,
      maxWidth: 620,
      actions: event.choices.map((choice) => ({
        label: choice.label,
        ...(choice.cost ? { sublabel: `Costs ${choice.cost} gold` } : {}),
        enabled: this.manager.canChooseEvent(choice),
        variant: 'secondary' as const,
        onClick: () => {
          this.closeTopModal();
          const resolution = this.manager.resolveEventChoice(tileId, event.id, choice.id);
          if (resolution.battle) {
            this.goto('Battle', { tileId, encounterId: resolution.battle.id, fromEvent: true });
            return;
          }
          if (resolution.needsArmyChoice) {
            this.openArmyChoice(tileId, resolution.needsArmyChoice, resolution.messages);
            return;
          }
          this.refreshAfterInteraction(resolution.messages);
        },
      })),
    });
  }

  private openMerchant(tileId: string): void {
    const stock = this.manager.merchantStock(tileId);
    showModal(this, {
      title: 'Merchant',
      body: `You carry ${this.manager.gold} gold.`,
      accent: Theme.color.gold,
      maxWidth: 620,
      actions: [
        ...stock.map((item) => ({
          label: item.sold ? `${item.label} — SOLD` : `${item.label} — ${item.price}g`,
          sublabel: item.description,
          enabled: !item.sold && this.manager.gold >= item.price,
          variant: 'secondary' as const,
          onClick: () => {
            const result = this.manager.buy(tileId, item.id);
            this.toast(result.message, result.ok ? 'good' : 'bad');
            if (result.ok) audio.play('reward');
            this.closeTopModal();
            if (this.manager.pendingReward) {
              this.goto('Reward', { inline: true });
              return;
            }
            this.time.delayedCall(60, () => this.openMerchant(tileId));
          },
        })),
        {
          label: 'LEAVE',
          variant: 'ghost' as const,
          onClick: () => {
            this.closeTopModal();
            this.manager.closeMerchant(tileId);
            this.scene.restart();
          },
        },
      ],
    });
  }

  private openArmyChoice(tileId: string, purpose: ArmyChoicePurpose, carryMessages: string[] = []): void {
    if (purpose === 'RECRUITMENT_CAMP') {
      const options = this.manager.mercenaryOptions();
      showModal(this, {
        title: 'Recruitment Camp',
        body: 'A free banner. Who takes it for this floor?',
        actions: [
          ...options.map((heroId) => ({
            label: getHero(heroId).name,
            sublabel: `${getHero(heroId).heroClass} · ${getHero(heroId).activeSkill.name}`,
            onClick: () => {
              this.closeTopModal();
              const messages = this.manager.resolveArmyChoice(tileId, purpose, heroId);
              this.refreshAfterInteraction([...carryMessages, ...messages]);
            },
          })),
          {
            label: 'NOBODY',
            variant: 'ghost' as const,
            onClick: () => {
              this.closeTopModal();
              const tile = this.manager.view.get(tileId);
              if (tile) this.manager.fog.clearTile(tile);
              this.refreshAfterInteraction(carryMessages);
            },
          },
        ],
      });
      return;
    }

    const wantsDead = purpose === 'RESURRECTION_SHRINE' || purpose === 'RELIC_REVIVE';
    const candidates = this.manager.armies.filter((army) => (wantsDead ? !army.alive : army.alive));
    const titles: Record<string, string> = {
      HEALING_FOUNTAIN: 'Healing Fountain',
      WAR_CAMP: 'War Camp',
      RESURRECTION_SHRINE: 'Resurrection Shrine',
      RELIC_HEAL: 'Choose an army to heal',
      RELIC_REVIVE: 'Choose an army to revive',
      RELIC_BUFF: 'Choose an army to empower',
    };

    showModal(this, {
      title: titles[purpose] ?? 'Choose an army',
      body: wantsDead ? 'Which fallen army returns?' : 'Which army benefits?',
      maxWidth: 620,
      actions: candidates.map((army) => ({
        label: getHero(army.heroId).name,
        sublabel: army.alive ? `${Math.round(army.hpRatio * 100)}% HP` : 'Fallen',
        onClick: () => {
          this.closeTopModal();
          const messages = purpose.startsWith('RELIC_')
            ? this.useRelicOnArmy(purpose, army.id)
            : this.manager.resolveArmyChoice(tileId, purpose, army.id);
          this.refreshAfterInteraction([...carryMessages, ...messages]);
        },
      })),
    });
  }

  private useRelicOnArmy(_purpose: ArmyChoicePurpose, armyId: string): string[] {
    if (!this.pendingRelicUid) return [];
    const uid = this.pendingRelicUid;
    this.pendingRelicUid = null;
    return this.manager.useRelic(uid, armyId).messages;
  }

  /* ---------------------------------------------------------------- */
  /* Bottom bar                                                        */
  /* ---------------------------------------------------------------- */

  private drawBottomBar(): void {
    const height = this.bottomBarHeight;
    const y = this.H - height;
    const bar = this.add.graphics().setDepth(400);
    bar.fillStyle(Theme.color.bg, 0.9);
    bar.fillRect(0, y, this.W, height);
    bar.lineStyle(1, Theme.color.border, 0.8);
    bar.lineBetween(0, y, this.W, y);

    const run = this.manager.run;
    const buttonWidth = Math.min(this.fs(120), (this.W - this.fs(24)) / 3);
    const centerY = y + height - Math.max(Theme.touch / 2 + 4, this.fs(23));

    // This prompt never disappears behind the grid. The old objective was
    // only visible on unusually tall screens, leaving most players staring at
    // symbols with no explanation of what was actionable.
    const frontier = this.manager.fog.frontier();
    const routeNames = Array.from(new Set(frontier.map((tile) => TILE_LABEL[tile.type])));
    const remaining = this.manager.view.tiles.filter(
      (tile) => tile.state !== 'CLEARED' && tile.type !== 'BLOCKED' && tile.type !== 'EXIT',
    ).length;
    const extra = Math.max(0, routeNames.length - 3);
    const routeSummary = routeNames.slice(0, 3).join('  ·  ');
    const objective = this.manager.guardianDefeated
      ? `EXIT OPEN  ·  ${remaining} sites remain`
      : routeSummary
        ? `CHOOSE A GLOWING TILE  ·  ${routeSummary}${extra > 0 ? `  +${extra}` : ''}`
        : 'FIND AND DEFEAT THE GUARDIAN';
    this.label(this.W / 2, y + this.fs(13), objective, {
      size: 10,
      color: this.manager.guardianDefeated ? Theme.color.good : Theme.color.textDim,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
      wrap: this.W - this.fs(24),
      letterSpacing: 1,
    }).setDepth(402);

    new Button(this, this.fs(12) + buttonWidth / 2, centerY, {
      width: buttonWidth,
      height: Math.max(Theme.touch, this.fs(40)),
      label: `RELICS ${run.relics.length}/${GameConfig.run.relicInventorySize}`,
      variant: 'secondary',
      fontSize: this.fs(13),
      onClick: () => this.openRelics(),
    }).setDepth(401);

    new Button(this, this.W / 2, centerY, {
      width: buttonWidth,
      height: Math.max(Theme.touch, this.fs(40)),
      label: `BLESSINGS ${run.blessings.reduce((s, b) => s + b.stacks, 0)}`,
      variant: 'secondary',
      fontSize: this.fs(13),
      onClick: () => this.openBlessings(),
    }).setDepth(401);

    const goldX = this.W - this.fs(12) - buttonWidth / 2;
    const goldPanel = this.add.graphics().setDepth(401);
    const buttonHeight = Math.max(Theme.touch, this.fs(40));
    drawPanel(goldPanel, { width: buttonWidth, height: buttonHeight, fill: Theme.color.panel, border: Theme.color.goldDim });
    goldPanel.setPosition(goldX, centerY);
    this.label(goldX, centerY, `${run.gold} GOLD`, {
      size: 14,
      color: Theme.color.goldBright,
      origin: [0.5, 0.5],
      align: 'center',
    }).setDepth(402);
  }

  private openRelics(): void {
    const relics = this.manager.ownedRelics();
    if (relics.length === 0) {
      showModal(this, {
        title: 'Relic Satchel',
        body: 'Empty. Relics come from treasure, merchants and events.',
        dismissible: true,
        actions: [{ label: 'CLOSE', variant: 'ghost', onClick: () => this.closeTopModal() }],
      });
      return;
    }

    showModal(this, {
      title: 'Relic Satchel',
      body: `${relics.length} / ${GameConfig.run.relicInventorySize} carried`,
      maxWidth: 620,
      dismissible: true,
      actions: [
        ...relics.map(({ def, owned }) => ({
          label: def.name,
          sublabel: def.description,
          enabled: this.manager.canUseRelic(def, 'MAP'),
          onClick: () => {
            this.closeTopModal();
            const result = this.manager.useRelic(owned.uid);
            if (result.needsArmy) {
              this.pendingRelicUid = owned.uid;
              this.openArmyChoice('', result.needsArmy);
              return;
            }
            this.refreshAfterInteraction(result.messages);
          },
        })),
        { label: 'CLOSE', variant: 'ghost' as const, onClick: () => this.closeTopModal() },
      ],
    });
  }

  private openBlessings(): void {
    const blessings = this.manager.ownedBlessings();
    showModal(this, {
      title: 'Blessings',
      body: blessings.length === 0 ? 'None yet. You earn one after every floor.' : `${blessings.length} distinct blessings.`,
      notes: blessings.map(
        ({ def, owned }) => `${def.name}${owned.stacks > 1 ? ` x${owned.stacks}` : ''} — ${def.description}`,
      ),
      dismissible: true,
      maxWidth: 640,
      actions: [{ label: 'CLOSE', variant: 'ghost', onClick: () => this.closeTopModal() }],
    });
  }

  private openMenu(): void {
    showModal(this, {
      title: 'Expedition',
      body: `Floor ${this.manager.floor}  ·  ${this.manager.run.runStats.enemiesDefeated} enemies defeated`,
      dismissible: true,
      actions: [
        { label: 'RESUME', variant: 'primary', onClick: () => this.closeTopModal() },
        {
          label: 'SAVE AND QUIT TO MENU',
          sublabel: 'Your run is kept exactly where it is',
          onClick: () => {
            void saveManager.flush();
            this.goto('MainMenu');
          },
        },
        {
          label: 'ABANDON EXPEDITION',
          variant: 'danger',
          onClick: () => {
            session.endRun(false);
            this.goto('RunEnd', { won: false });
          },
        },
      ],
    });
  }

  /* ---------------------------------------------------------------- */
  /* Floor transition                                                  */
  /* ---------------------------------------------------------------- */

  private leaveFloor(): void {
    const remaining = this.manager.view.tiles.filter(
      (tile) => this.manager.canInteract(tile.id) && tile.type !== 'EXIT',
    ).length;

    const descend = () => {
      this.closeTopModal();
      const isFinal =
        this.manager.run.mode !== 'ENDLESS' && this.manager.floor >= GameConfig.run.totalFloors;
      if (isFinal) {
        session.endRun(true);
        this.goto('RunEnd', { won: true });
        return;
      }
      this.goto('Reward', { inline: false });
    };

    if (remaining > 0) {
      showModal(this, {
        title: 'Descend?',
        body: `There are still ${remaining} tiles you could explore on this floor.`,
        notes: ['Anything you leave behind is gone for good.'],
        dismissible: true,
        actions: [
          { label: 'DESCEND', variant: 'primary', onClick: descend },
          { label: 'KEEP EXPLORING', variant: 'ghost', onClick: () => this.closeTopModal() },
        ],
      });
      return;
    }
    descend();
  }

  private showBanner(text: string): void {
    const banner = this.add.container(this.W / 2, this.H * 0.34).setDepth(7000);
    const label = this.label(0, 0, text, {
      size: 26,
      color: Theme.color.goldBright,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 3,
      wrap: this.W * 0.86,
    });
    const g = this.add.graphics();
    g.fillStyle(Theme.color.bg, 0.85);
    g.fillRect(-this.W / 2, -label.height / 2 - this.fs(16), this.W, label.height + this.fs(32));
    g.lineStyle(1, Theme.color.gold, 0.8);
    g.lineBetween(-this.W / 2, -label.height / 2 - this.fs(16), this.W / 2, -label.height / 2 - this.fs(16));
    g.lineBetween(-this.W / 2, label.height / 2 + this.fs(16), this.W / 2, label.height / 2 + this.fs(16));
    banner.add([g, label]);
    banner.setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, duration: 220, yoyo: true, hold: 1100, onComplete: () => banner.destroy() });
  }

  private closeTopModal(): void {
    closeTopModal(this);
  }
}
