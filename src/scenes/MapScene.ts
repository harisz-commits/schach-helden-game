import Phaser from 'phaser';
import type { ArmyRunState, TileData } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { Theme, hpColor, toCss } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { drawPanel } from '../ui/components/Panel';
import { closeTopModal, showModal } from '../ui/overlays/Modal';
import { TILE_DESCRIPTION, TILE_LABEL, drawTileGlyph, tileAccent } from '../ui/TileGlyphs';
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
  private tileSize = 48;
  private gridOrigin = { x: 0, y: 0 };
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

  private get hudHeight(): number {
    const rows = Math.ceil(this.manager.armies.length / (this.W > this.fs(560) ? 5 : 3));
    return this.fs(58) + rows * this.fs(40);
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
      this.label(pad, this.fs(14), `FLOOR ${run.floor} / ${totalFloors}`, {
        size: 17,
        color: Theme.color.goldBright,
        letterSpacing: 2,
      }),
    );
    this.hudLayer.add(
      this.label(pad, this.fs(36), biome.name.toUpperCase(), {
        size: 10,
        color: Theme.color.textFaint,
        font: 'body',
        letterSpacing: 3,
      }),
    );

    // Guardian status - the player must always know what is left to do.
    const guardianText = this.manager.guardianDefeated ? 'GUARDIAN DEFEATED · EXIT OPEN' : 'GUARDIAN AWAITS';
    this.hudLayer.add(
      this.label(this.W - pad, this.fs(36), guardianText, {
        size: 10,
        color: this.manager.guardianDefeated ? Theme.color.good : Theme.color.warn,
        font: 'body',
        origin: [1, 0],
        letterSpacing: 2,
      }),
    );

    const menu = new Button(this, this.W - pad - this.fs(28), this.fs(20), {
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
    const top = this.fs(52);

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
    return this.fs(60);
  }

  private drawGrid(): void {
    this.gridLayer.removeAll(true);
    this.pulseTargets = [];

    const view = this.manager.view;
    const top = this.hudHeight + this.fs(10);
    const bottom = this.H - this.bottomBarHeight - this.fs(10);
    const availableWidth = this.W - this.fs(16);
    const availableHeight = bottom - top;
    const gap = this.fs(4);

    const size = Math.floor(
      Math.min(
        (availableWidth - (view.width - 1) * gap) / view.width,
        (availableHeight - (view.height - 1) * gap) / view.height,
      ),
    );
    this.tileSize = Math.max(22, size);

    const gridWidth = view.width * this.tileSize + (view.width - 1) * gap;
    const gridHeight = view.height * this.tileSize + (view.height - 1) * gap;
    this.gridOrigin = {
      x: (this.W - gridWidth) / 2 + this.tileSize / 2,
      y: top + (availableHeight - gridHeight) / 2 + this.tileSize / 2,
    };

    for (const tile of view.tiles) {
      const cell = this.buildTile(tile, gap);
      if (cell) this.gridLayer.add(cell);
    }

    this.drawObjective(this.gridOrigin.y + gridHeight - this.tileSize / 2 + this.fs(22));
  }

  /**
   * A one-line objective under the grid. Tall phones leave room below a square
   * grid, and "what do I do next" is the question that room should answer.
   */
  private drawObjective(y: number): void {
    if (y > this.H - this.bottomBarHeight - this.fs(20)) return;
    const remaining = this.manager.view.tiles.filter(
      (tile) => tile.state !== 'CLEARED' && tile.type !== 'BLOCKED' && tile.type !== 'EXIT',
    ).length;
    const text = this.manager.guardianDefeated
      ? `The way out is open · ${remaining} tiles left to explore`
      : 'Find and defeat the Guardian to open the way out';
    this.gridLayer.add(
      this.label(this.W / 2, y, text, {
        size: 12,
        color: this.manager.guardianDefeated ? Theme.color.good : Theme.color.textDim,
        font: 'body',
        origin: [0.5, 0.5],
        align: 'center',
        wrap: this.W - this.fs(30),
      }),
    );
  }

  private tilePosition(tile: TileData, gap: number): { x: number; y: number } {
    return {
      x: this.gridOrigin.x + tile.x * (this.tileSize + gap),
      y: this.gridOrigin.y + tile.y * (this.tileSize + gap),
    };
  }

  private buildTile(tile: TileData, gap: number): Phaser.GameObjects.Container | null {
    if (tile.type === 'BLOCKED') return null;
    const biome = BIOMES_BY_ID[this.manager.view.data.biomeId] ?? biomeForFloor(this.manager.floor);
    const pos = this.tilePosition(tile, gap);
    const container = this.add.container(pos.x, pos.y);
    const size = this.tileSize;

    const interactable = this.manager.canInteract(tile.id);
    const known = tile.state !== 'HIDDEN' || tile.scouted;
    const cleared = tile.state === 'CLEARED';
    const exitLocked = tile.type === 'EXIT' && !this.manager.guardianDefeated;

    const g = this.add.graphics();
    const fill = !known
      ? biome.palette.fog
      : cleared
        ? biome.palette.tile
        : interactable
          ? biome.palette.tileAlt
          : biome.palette.tile;
    g.fillStyle(fill, known ? 1 : 0.92);
    g.fillRoundedRect(-size / 2, -size / 2, size, size, Math.max(3, size * 0.14));
    g.lineStyle(1, Theme.color.border, known ? 0.7 : 0.35);
    g.strokeRoundedRect(-size / 2, -size / 2, size, size, Math.max(3, size * 0.14));
    container.add(g);

    if (!known) {
      container.add(
        this.label(0, 0, '?', {
          size: Math.round(size * 0.34),
          color: Theme.color.textFaint,
          origin: [0.5, 0.5],
          align: 'center',
          alpha: 0.55,
        }),
      );
      return container;
    }

    // Glyph.
    const glyph = this.add.graphics();
    const accent = tileAccent(tile.type);
    drawTileGlyph(glyph, cleared ? 'EMPTY' : tile.type, size * 0.6, cleared ? Theme.color.textFaint : accent);
    glyph.setAlpha(cleared ? 0.4 : tile.state === 'REVEALED' || tile.scouted ? 1 : 0.5);
    container.add(glyph);

    if (cleared && tile.id === this.manager.view.data.startTileId) {
      const start = this.add.graphics();
      drawTileGlyph(start, 'START', size * 0.5, Theme.color.goldDim);
      container.add(start);
    }

    // Scouted but out of reach: dim and desaturate.
    if (tile.state === 'HIDDEN' && tile.scouted) {
      container.setAlpha(0.5);
    }

    if (interactable && !exitLocked) {
      const ring = this.add.graphics();
      ring.lineStyle(Math.max(2, size * 0.07), Theme.color.goldBright, 1);
      ring.strokeRoundedRect(-size / 2 - 1, -size / 2 - 1, size + 2, size + 2, Math.max(3, size * 0.15));
      container.add(ring);
      this.pulseTargets.push(ring);
    } else if (exitLocked && tile.state === 'REVEALED') {
      const ring = this.add.graphics();
      ring.lineStyle(Math.max(1.5, size * 0.05), Theme.color.bad, 0.6);
      ring.strokeRoundedRect(-size / 2 - 1, -size / 2 - 1, size + 2, size + 2, Math.max(3, size * 0.15));
      container.add(ring);
    }

    const hit = this.add.rectangle(0, 0, size, size, 0x000000, 0).setInteractive({ useHandCursor: true });
    let downAt = { x: 0, y: 0 };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y };
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 14) return;
      this.onTileTapped(tile);
    });
    container.add(hit);

    return container;
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
    const centerY = y + height / 2;

    new Button(this, this.fs(12) + buttonWidth / 2, centerY, {
      width: buttonWidth,
      height: this.fs(40),
      label: `RELICS ${run.relics.length}/${GameConfig.run.relicInventorySize}`,
      variant: 'secondary',
      fontSize: this.fs(13),
      onClick: () => this.openRelics(),
    }).setDepth(401);

    new Button(this, this.W / 2, centerY, {
      width: buttonWidth,
      height: this.fs(40),
      label: `BLESSINGS ${run.blessings.reduce((s, b) => s + b.stacks, 0)}`,
      variant: 'secondary',
      fontSize: this.fs(13),
      onClick: () => this.openBlessings(),
    }).setDepth(401);

    const goldX = this.W - this.fs(12) - buttonWidth / 2;
    const goldPanel = this.add.graphics().setDepth(401);
    drawPanel(goldPanel, { width: buttonWidth, height: this.fs(40), fill: Theme.color.panel, border: Theme.color.goldDim });
    goldPanel.setPosition(goldX, centerY);
    this.add
      .text(goldX, centerY, `${run.gold} GOLD`, {
        fontFamily: Theme.font.display,
        fontSize: `${this.fs(14)}px`,
        color: toCss(Theme.color.goldBright),
      })
      .setOrigin(0.5)
      .setDepth(402);
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
