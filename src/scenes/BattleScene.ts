import Phaser from 'phaser';
import type { ArmyRunState, EncounterData, Row } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { Theme, hpColor, toCss } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { drawPanel } from '../ui/components/Panel';
import { closeTopModal, showModal } from '../ui/overlays/Modal';
import { ensureUnitTexture } from '../ui/Sprites';
import { session } from '../run/GameSession';
import { saveManager } from '../save/SaveManager';
import { audio } from '../audio/AudioManager';
import { getHero } from '../data/heroes';
import { ENEMIES_BY_ID } from '../data/enemies';
import { BOSSES } from '../data/bosses';
import { GameConfig } from '../core/GameConfig';
import { SLOTS_PER_ROW } from '../combat/Formation';
import { CombatEngine, type BattleResult, type CombatLogEntry } from '../combat/CombatEngine';
import type { Combatant } from '../combat/Combatant';
import type { RunManager } from '../run/RunManager';
import { registerDevBridge } from '../debug/DevBridge';

interface SceneData {
  tileId: string;
  encounterId: string;
  fromEvent?: boolean;
}

interface UnitView {
  combatant: Combatant;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  energyBar: Phaser.GameObjects.Graphics;
  lastHP: number;
}

/** Combat-space extents used to map the simulation onto the screen. */
const FIELD_X = 800;
const FIELD_Y = 400;

/**
 * Battle screen.
 *
 * Two phases: formation prep (the only place the player makes decisions) and
 * the auto-resolved fight, which is a pure view over CombatEngine.
 */
export class BattleScene extends BaseScene {
  private manager!: RunManager;
  private encounter!: EncounterData;
  private tileId = '';
  private fromEvent = false;

  private phase: 'PREP' | 'FIGHT' | 'RESULT' = 'PREP';
  private engine: CombatEngine | null = null;
  private speed = 1;
  private paused = false;
  private logCursor = 0;

  private fieldLayer!: Phaser.GameObjects.Container;
  private views = new Map<string, UnitView>();
  private selectedArmyId: string | null = null;
  private formation = new Map<string, { row: Row; slot: number }>();
  private result: BattleResult | null = null;
  private speedButton?: Button;
  private timerLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  init(data: SceneData): void {
    this.tileId = data.tileId;
    this.fromEvent = data.fromEvent ?? false;
    this.phase = 'PREP';
    this.engine = null;
    this.result = null;
    this.logCursor = 0;
    this.views.clear();
    this.selectedArmyId = null;
    this.formation.clear();

    const manager = session.runManager;
    if (!manager) return;
    this.manager = manager;
    const encounter = manager.run.currentMap?.map.encounters[data.encounterId];
    if (encounter) this.encounter = encounter;
    for (const army of manager.livingArmies) {
      this.formation.set(army.id, { row: army.row, slot: army.slot });
    }
  }

  create(): void {
    if (!this.manager || !this.encounter) {
      this.scene.start('MainMenu');
      return;
    }
    this.speed = Math.min(session.profile.settings.battleSpeed || 1, session.maxSpeed());
    this.paintBackground(Theme.color.bgAlt, Theme.color.enemy);
    this.fieldLayer = this.add.container(0, 0);
    this.buildPrep();
    this.enableResponsiveLayout();
    this.fadeIn();

    registerDevBridge(this, {
      scene: 'Battle',
      phase: () => this.phase,
      start: () => {
        if (this.phase === 'PREP') this.startBattle();
      },
      outcome: () => this.engine?.outcome ?? 'ONGOING',
      elapsed: () => this.engine?.time ?? 0,
      setSpeed: (value: number) => {
        this.speed = value;
      },
    });

    this.game.events.on('platform:pause', this.onPlatformPause, this);
    this.game.events.on('platform:resume', this.onPlatformResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('platform:pause', this.onPlatformPause, this);
      this.game.events.off('platform:resume', this.onPlatformResume, this);
    });
  }

  private onPlatformPause(): void {
    this.paused = true;
    audio.setPaused(true);
  }

  private onPlatformResume(): void {
    this.paused = false;
    audio.setPaused(false);
  }

  protected override layout(): void {
    // Never restart mid-fight: rebuild only the static furniture.
    if (this.phase === 'FIGHT') return;
    this.scene.restart({ tileId: this.tileId, encounterId: this.encounter.id, fromEvent: this.fromEvent });
  }

  /* ---------------------------------------------------------------- */
  /* Preparation                                                       */
  /* ---------------------------------------------------------------- */

  private buildPrep(): void {
    const cx = this.W / 2;

    this.label(cx, this.fs(24), this.encounter.name.toUpperCase(), {
      size: 20,
      color: this.encounter.kind === 'BOSS' ? Theme.color.legendary : Theme.color.goldBright,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 3,
      wrap: this.W - 40,
    });
    this.label(cx, this.fs(48), `${this.encounter.units.length} enemies  ·  Floor ${this.manager.floor}`, {
      size: 12,
      color: Theme.color.textDim,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
    });

    // Centre the enemy preview + formation block between the header and the
    // action buttons, so tall screens do not leave a hole in the middle.
    const enemyRows = Math.ceil(Math.min(this.encounter.units.length, 8) / Math.min(this.encounter.units.length, 6));
    const previewHeight = this.fs(48) + enemyRows * this.fs(40);
    const formationHeight = this.fs(64) + 2 * Math.min(this.fs(72), (Math.min(this.W - this.fs(24), this.fs(440)) / SLOTS_PER_ROW) * 1.15) + this.fs(26);
    const areaTop = this.fs(66);
    const areaBottom = this.H - this.fs(120);
    const blockTop = Math.max(areaTop, areaTop + (areaBottom - areaTop - previewHeight - formationHeight) / 2);

    this.buildEnemyPreview(blockTop + this.fs(8));
    this.buildFormationEditor(blockTop + previewHeight + this.fs(18));

    const bottom = this.H - this.fs(30);
    const width = Math.min(this.fs(320), this.W - 40);

    new Button(this, cx, bottom, {
      width,
      height: Math.max(Theme.touch + 4, this.fs(54)),
      label: 'START BATTLE',
      variant: 'primary',
      onClick: () => this.startBattle(),
    });

    const smallWidth = Math.min(this.fs(150), (this.W - this.fs(36)) / 2);
    new Button(this, cx - smallWidth / 2 - this.fs(6), bottom - this.fs(58), {
      width: smallWidth,
      height: this.fs(40),
      label: 'AUTO FORMATION',
      variant: 'ghost',
      fontSize: this.fs(12),
      onClick: () => this.autoFormation(),
    });
    new Button(this, cx + smallWidth / 2 + this.fs(6), bottom - this.fs(58), {
      width: smallWidth,
      height: this.fs(40),
      label: 'USE RELIC',
      variant: 'ghost',
      fontSize: this.fs(12),
      onClick: () => this.openPreBattleRelics(),
    });

    new Button(this, this.fs(44), this.fs(24), {
      width: this.fs(66),
      height: this.fs(32),
      label: 'RETREAT',
      variant: 'ghost',
      fontSize: this.fs(11),
      onClick: () => this.goto('Map'),
    });
  }

  private buildEnemyPreview(top: number): void {
    const units = this.encounter.units;
    const width = Math.min(this.W - this.fs(24), this.fs(560));
    const perRow = Math.min(units.length, 6);
    const cell = Math.min(this.fs(64), width / Math.max(1, perRow));
    const startX = this.W / 2 - ((Math.min(units.length, perRow) - 1) * cell) / 2;

    this.label(this.W / 2, top - this.fs(8), 'THEY BRING', {
      size: 10,
      color: Theme.color.textFaint,
      font: 'body',
      origin: [0.5, 0.5],
      letterSpacing: 3,
      align: 'center',
    });

    units.slice(0, 8).forEach((unit, index) => {
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const x = startX + column * cell;
      const y = top + this.fs(34) + row * this.fs(40);
      const def = this.enemyArt(unit.defId);
      const key = ensureUnitTexture(this, def.shape, def.color, def.accent);
      this.add.image(x, y, key).setDisplaySize(this.fs(34), this.fs(43));
      if (unit.eliteModifiers && unit.eliteModifiers.length > 0) {
        this.label(x, y + this.fs(24), unit.eliteModifiers[0]!.slice(0, 8), {
          size: 8,
          color: Theme.color.bad,
          font: 'body',
          origin: [0.5, 0.5],
          align: 'center',
        });
      }
    });
  }

  /** Bosses live in their own table; everything else is a plain enemy. */
  private enemyArt(defId: string): { shape: string; color: number; accent: number } {
    const enemy = ENEMIES_BY_ID[defId];
    if (enemy) return enemy.art;
    const boss = BOSSES.find((b) => b.enemy.id === defId);
    return boss ? boss.enemy.art : { shape: 'BLADE', color: 0x888888, accent: 0xcccccc };
  }

  private buildFormationEditor(top: number): void {
    const armies = this.manager.livingArmies;
    const gridWidth = Math.min(this.W - this.fs(24), this.fs(440));
    const cellW = gridWidth / SLOTS_PER_ROW;
    const cellH = Math.min(this.fs(72), cellW * 1.15);
    const startX = this.W / 2 - gridWidth / 2 + cellW / 2;

    this.label(this.W / 2, top - this.fs(6), 'YOUR FORMATION', {
      size: 10,
      color: Theme.color.textFaint,
      font: 'body',
      origin: [0.5, 0.5],
      letterSpacing: 3,
      align: 'center',
    });
    this.label(this.W / 2, top + this.fs(12), 'Tap an army, then tap a slot', {
      size: 11,
      color: Theme.color.textDim,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
    });

    const rows: Row[] = ['FRONT', 'BACK'];
    rows.forEach((row, rowIndex) => {
      const y = top + this.fs(34) + rowIndex * (cellH + this.fs(26)) + cellH / 2;
      this.label(this.W / 2 - gridWidth / 2 + this.fs(2), y - cellH / 2 - this.fs(10), row === 'FRONT' ? 'FRONT ROW' : 'BACK ROW', {
        size: 9,
        color: Theme.color.textFaint,
        font: 'body',
        origin: [0, 0.5],
        letterSpacing: 2,
      });
      for (let slot = 0; slot < SLOTS_PER_ROW; slot++) {
        const x = startX + slot * cellW;
        const army = armies.find((a) => {
          const place = this.formation.get(a.id);
          return place?.row === row && place.slot === slot;
        });
        this.buildFormationCell(x, y, cellW - this.fs(6), cellH, row, slot, army);
      }
    });
  }

  private buildFormationCell(
    x: number,
    y: number,
    width: number,
    height: number,
    row: Row,
    slot: number,
    army: ArmyRunState | undefined,
  ): void {
    const container = this.add.container(x, y);
    const selected = army && this.selectedArmyId === army.id;

    const g = this.add.graphics();
    drawPanel(g, {
      width,
      height,
      fill: army ? (selected ? Theme.color.panelHi : Theme.color.panel) : Theme.color.bgAlt,
      border: selected ? Theme.color.goldBright : army ? Theme.color.border : Theme.color.border,
      radius: 8,
    });
    container.add(g);

    if (army) {
      const hero = getHero(army.heroId);
      const key = ensureUnitTexture(this, hero.art.shape, hero.art.color, hero.art.accent);
      container.add(this.add.image(0, -height * 0.2, key).setDisplaySize(width * 0.44, width * 0.56));
      container.add(
        this.label(0, height / 2 - this.fs(16), hero.name.toUpperCase(), {
          size: 9,
          color: Theme.color.text,
          origin: [0.5, 0.5],
          align: 'center',
        }),
      );
      container.add(
        this.label(0, height / 2 - this.fs(6), `${Math.round(army.hpRatio * 100)}%`, {
          size: 9,
          color: hpColor(army.hpRatio),
          font: 'body',
          origin: [0.5, 0.5],
          align: 'center',
        }),
      );
    } else {
      container.add(
        this.label(0, 0, '·', {
          size: 18,
          color: Theme.color.textFaint,
          origin: [0.5, 0.5],
          align: 'center',
        }),
      );
    }

    const hit = this.add.rectangle(0, 0, width, height, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.onSlotTapped(row, slot, army));
    container.add(hit);
  }

  private onSlotTapped(row: Row, slot: number, army: ArmyRunState | undefined): void {
    audio.play('click');
    if (this.selectedArmyId) {
      const moving = this.selectedArmyId;
      const occupant = army;
      const from = this.formation.get(moving)!;
      if (occupant && occupant.id !== moving) {
        this.formation.set(occupant.id, { row: from.row, slot: from.slot });
      }
      this.formation.set(moving, { row, slot });
      this.selectedArmyId = null;
      this.applyFormation();
      this.scene.restart({ tileId: this.tileId, encounterId: this.encounter.id, fromEvent: this.fromEvent });
      return;
    }
    if (army) {
      this.selectedArmyId = army.id;
      this.scene.restart({ tileId: this.tileId, encounterId: this.encounter.id, fromEvent: this.fromEvent });
    }
  }

  private applyFormation(): void {
    for (const army of this.manager.armies) {
      const place = this.formation.get(army.id);
      if (!place) continue;
      army.row = place.row;
      army.slot = place.slot;
    }
    saveManager.requestSave();
  }

  private autoFormation(): void {
    const armies = this.manager.livingArmies;
    const used: Record<Row, number> = { FRONT: 0, BACK: 0 };
    for (const army of armies) {
      const preferred = getHero(army.heroId).preferredRow;
      const other: Row = preferred === 'FRONT' ? 'BACK' : 'FRONT';
      const row = used[preferred] < SLOTS_PER_ROW ? preferred : other;
      this.formation.set(army.id, { row, slot: used[row] });
      used[row] += 1;
    }
    this.applyFormation();
    this.scene.restart({ tileId: this.tileId, encounterId: this.encounter.id, fromEvent: this.fromEvent });
  }

  private openPreBattleRelics(): void {
    const relics = this.manager.ownedRelics().filter(({ def }) => this.manager.canUseRelic(def, 'PRE_BATTLE'));
    if (relics.length === 0) {
      this.toast('No relic can be used right now.');
      return;
    }
    showModal(this, {
      title: 'Use a relic',
      body: 'Relics used here affect only the coming battle.',
      dismissible: true,
      maxWidth: 620,
      actions: [
        ...relics.map(({ def, owned }) => ({
          label: def.name,
          sublabel: def.description,
          onClick: () => {
            closeTopModal(this);
            if (def.targeting === 'SINGLE_ARMY') {
              this.pickRelicTarget(def.name, owned.uid);
              return;
            }
            this.applyRelic(owned.uid, def.id);
          },
        })),
        { label: 'CLOSE', variant: 'ghost' as const, onClick: () => closeTopModal(this) },
      ],
    });
  }

  /** Relics that buff or heal a single army let the player choose which. */
  private pickRelicTarget(relicName: string, uid: string): void {
    showModal(this, {
      title: relicName,
      body: 'Which army?',
      maxWidth: 620,
      actions: this.manager.livingArmies.map((army) => ({
        label: getHero(army.heroId).name,
        sublabel: `${Math.round(army.hpRatio * 100)}% HP · ${army.row === 'FRONT' ? 'Front' : 'Back'} row`,
        onClick: () => {
          closeTopModal(this);
          this.applyRelic(uid, '', army.id);
        },
      })),
    });
  }

  private applyRelic(uid: string, relicId: string, armyId?: string): void {
    const result = this.manager.useRelic(uid, armyId);
    for (const message of result.messages) this.toast(message, 'good');
    // A Smoke Bomb skips the fight entirely rather than starting it.
    if (relicId === 'smoke_bomb' && this.encounter.kind === 'ENEMY') {
      const tile = this.manager.view.get(this.tileId);
      if (tile) this.manager.fog.clearTile(tile);
      this.goto('Map', { messages: ['You slip past the warband unseen.'] });
      return;
    }
    this.scene.restart({ tileId: this.tileId, encounterId: this.encounter.id, fromEvent: this.fromEvent });
  }

  /* ---------------------------------------------------------------- */
  /* Fight                                                             */
  /* ---------------------------------------------------------------- */

  private startBattle(): void {
    this.applyFormation();
    this.engine = new CombatEngine(this.manager.buildBattleSetup(this.encounter));
    this.phase = 'FIGHT';
    this.children.removeAll(true);
    this.views.clear();
    this.logCursor = 0;
    this.paintBackground(Theme.color.bgAlt, Theme.color.enemy);
    this.fieldLayer = this.add.container(0, 0);
    this.buildFightHUD();
    this.buildUnits();
    audio.play('skill');
  }

  private buildFightHUD(): void {
    const cx = this.W / 2;
    this.label(cx, this.fs(18), this.encounter.name.toUpperCase(), {
      size: 14,
      color: this.encounter.kind === 'BOSS' ? Theme.color.legendary : Theme.color.goldBright,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 2,
      wrap: this.W - 40,
    });
    this.timerLabel = this.label(cx, this.fs(38), '0.0s', {
      size: 11,
      color: Theme.color.textFaint,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
    });

    this.speedButton = new Button(this, this.W - this.fs(44), this.fs(26), {
      width: this.fs(64),
      height: this.fs(34),
      label: `${this.speed}x`,
      variant: 'secondary',
      fontSize: this.fs(14),
      onClick: () => this.cycleSpeed(),
    });
    this.speedButton.setDepth(600);
  }

  private cycleSpeed(): void {
    const max = session.maxSpeed();
    const options = GameConfig.combat.speeds.filter((s) => s <= max);
    const index = options.indexOf(this.speed);
    this.speed = options[(index + 1) % options.length] ?? 1;
    session.profile.settings.battleSpeed = this.speed;
    saveManager.requestSave();
    this.speedButton?.setLabel(`${this.speed}x`);
  }

  private fieldRect(): { x: number; y: number; width: number; height: number } {
    const top = this.fs(58);
    const bottom = this.H - this.fs(20);
    return { x: this.fs(10), y: top, width: this.W - this.fs(20), height: bottom - top };
  }

  /**
   * Uniform scale for the battlefield. Portrait phones get the lane rotated so
   * the two sides face each other top-to-bottom, which uses far more of the
   * screen than squeezing a wide lane into a narrow viewport.
   */
  private fieldScale(): number {
    const rect = this.fieldRect();
    return this.isPortrait
      ? Math.min(rect.height / FIELD_X, rect.width / FIELD_Y)
      : Math.min(rect.width / FIELD_X, rect.height / FIELD_Y);
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    const rect = this.fieldRect();
    const scale = this.fieldScale();
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    // Portrait: player (negative lane X) sits at the bottom of the screen.
    if (this.isPortrait) return { x: cx + y * scale, y: cy - x * scale };
    return { x: cx + x * scale, y: cy + y * scale };
  }

  /** Depth sorting: units nearer the viewer draw on top. */
  private depthFor(combatant: Combatant): number {
    return this.isPortrait ? 100 - combatant.x * 0.1 : 100 + combatant.y;
  }

  private buildUnits(): void {
    if (!this.engine) return;
    const spriteWidth = this.spriteWidth();
    const spriteHeight = spriteWidth * 1.28;

    for (const combatant of this.engine.snapshot()) {
      const key = ensureUnitTexture(this, combatant.art.shape, combatant.art.color, combatant.art.accent);
      const container = this.add.container(0, 0);
      const sprite = this.add.image(0, 0, key).setDisplaySize(spriteWidth, spriteHeight);
      if (!combatant.isPlayer && !this.isPortrait) sprite.setFlipX(true);
      container.add(sprite);

      const barWidth = spriteWidth * 1.05;
      const hpBar = this.add.graphics();
      const energyBar = this.add.graphics();
      container.add([hpBar, energyBar]);

      const nameLabel = this.label(0, spriteHeight * 0.58, combatant.name, {
        size: 9,
        color: combatant.isPlayer ? Theme.color.text : Theme.color.textDim,
        font: 'body',
        origin: [0.5, 0.5],
        align: 'center',
      });
      container.add(nameLabel);

      this.fieldLayer.add(container);
      this.views.set(combatant.id, {
        combatant,
        container,
        sprite,
        hpBar,
        energyBar,
        lastHP: combatant.currentHP,
      });
      this.drawUnitBars(this.views.get(combatant.id)!, barWidth, spriteHeight);
    }
    this.positionUnits();
  }

  private drawUnitBars(view: UnitView, width: number, spriteHeight: number): void {
    const { combatant, hpBar, energyBar } = view;
    const ratio = combatant.stats.maxHP > 0 ? Math.max(0, combatant.currentHP / combatant.stats.maxHP) : 0;
    const top = -spriteHeight * 0.56;
    const height = Math.max(3, this.fs(4));

    hpBar.clear();
    hpBar.fillStyle(Theme.color.bgAlt, 0.9);
    hpBar.fillRoundedRect(-width / 2, top, width, height, 2);
    if (ratio > 0) {
      hpBar.fillStyle(combatant.isPlayer ? hpColor(ratio) : Theme.color.enemy, 1);
      hpBar.fillRoundedRect(-width / 2, top, Math.max(1.5, width * ratio), height, 2);
    }
    if (combatant.shield > 0) {
      const shieldRatio = Math.min(1, combatant.shield / Math.max(1, combatant.stats.maxHP));
      hpBar.fillStyle(Theme.color.shield, 0.85);
      hpBar.fillRoundedRect(-width / 2, top - height - 1, Math.max(1.5, width * shieldRatio), height * 0.7, 2);
    }

    energyBar.clear();
    if (combatant.skill) {
      const energyRatio = combatant.energy / GameConfig.combat.energyMax;
      const ey = top + height + 1.5;
      energyBar.fillStyle(Theme.color.bgAlt, 0.8);
      energyBar.fillRoundedRect(-width / 2, ey, width, height * 0.62, 2);
      if (energyRatio > 0) {
        energyBar.fillStyle(energyRatio >= 1 ? Theme.color.goldBright : Theme.color.energy, 1);
        energyBar.fillRoundedRect(-width / 2, ey, Math.max(1.5, width * energyRatio), height * 0.62, 2);
      }
    }
  }

  private spriteWidth(): number {
    return Math.max(this.fs(28), 64 * this.fieldScale());
  }

  private positionUnits(): void {
    for (const view of this.views.values()) {
      const pos = this.toScreen(view.combatant.x, view.combatant.y);
      view.container.setPosition(pos.x, pos.y);
      view.container.setDepth(this.depthFor(view.combatant));
    }
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'FIGHT' || !this.engine || this.paused) return;

    const step = Math.min(delta, 60) / 1000;
    this.engine.update(step * this.speed);
    this.timerLabel?.setText(`${this.engine.time.toFixed(1)}s`);

    const spriteWidth = this.spriteWidth();
    for (const view of this.views.values()) {
      const pos = this.toScreen(view.combatant.x, view.combatant.y);
      view.container.setPosition(pos.x, pos.y);
      view.container.setDepth(this.depthFor(view.combatant));
      view.container.setAlpha(view.combatant.alive ? 1 : 0.18);
      this.drawUnitBars(view, spriteWidth * 1.05, spriteWidth * 1.28);
    }

    this.consumeLog();

    const banner = this.engine.takeBanner();
    if (banner) this.showPhaseBanner(banner);

    if (this.engine.outcome !== 'ONGOING') this.finishBattle();
  }

  private consumeLog(): void {
    if (!this.engine) return;
    const log = this.engine.log;
    const showNumbers = session.profile.settings.showDamageNumbers;
    while (this.logCursor < log.length) {
      const entry = log[this.logCursor++]!;
      this.renderLogEntry(entry, showNumbers);
    }
  }

  private renderLogEntry(entry: CombatLogEntry, showNumbers: boolean): void {
    switch (entry.type) {
      case 'DAMAGE': {
        const view = entry.targetId ? this.views.get(entry.targetId) : undefined;
        if (!view) return;
        this.flash(view, entry.isCrit ? Theme.color.goldBright : 0xffffff);
        if (showNumbers && entry.amount !== undefined) {
          this.floatNumber(view, Math.round(entry.amount), entry.isCrit ?? false, view.combatant.isPlayer);
        }
        audio.play(entry.isCrit ? 'crit' : 'hit');
        break;
      }
      case 'HEAL': {
        const view = entry.targetId ? this.views.get(entry.targetId) : undefined;
        if (!view || entry.amount === undefined || entry.amount < 1) return;
        if (showNumbers) this.floatText(view, `+${Math.round(entry.amount)}`, Theme.color.good);
        break;
      }
      case 'SKILL': {
        const view = entry.sourceId ? this.views.get(entry.sourceId) : undefined;
        if (!view) return;
        this.floatText(view, entry.text ?? 'Skill', Theme.color.goldBright, -0.9);
        audio.play('skill');
        if (!session.profile.settings.reduceMotion) {
          this.tweens.add({ targets: view.sprite, scaleX: view.sprite.scaleX * 1.14, yoyo: true, duration: 130 });
        }
        break;
      }
      case 'DEATH': {
        const view = entry.targetId ? this.views.get(entry.targetId) : undefined;
        if (!view) return;
        audio.play('death');
        this.tweens.add({ targets: view.container, alpha: 0.18, angle: view.combatant.isPlayer ? -12 : 12, duration: 260 });
        break;
      }
      case 'REVIVE': {
        const view = entry.targetId ? this.views.get(entry.targetId) : undefined;
        if (!view) return;
        this.tweens.add({ targets: view.container, alpha: 1, angle: 0, duration: 220 });
        this.floatText(view, 'REVIVED', Theme.color.goldBright, -1);
        break;
      }
      case 'INFO': {
        if (entry.text === 'LAST STAND' && entry.targetId) {
          const view = this.views.get(entry.targetId);
          if (view) this.floatText(view, 'LAST STAND', Theme.color.goldBright, -1);
        }
        break;
      }
      default:
        break;
    }
  }

  private flash(view: UnitView, color: number): void {
    if (session.profile.settings.reduceMotion) return;
    view.sprite.setTintFill(color);
    this.time.delayedCall(70, () => view.sprite.clearTint());
  }

  private floatNumber(view: UnitView, amount: number, crit: boolean, onPlayer: boolean): void {
    const color = crit ? Theme.color.goldBright : onPlayer ? Theme.color.bad : Theme.color.text;
    this.floatText(view, crit ? `${amount}!` : `${amount}`, color, -0.4, crit ? 15 : 12);
  }

  private floatText(view: UnitView, text: string, color: number, offset = -0.6, size = 11): void {
    const pos = this.toScreen(view.combatant.x, view.combatant.y);
    const label = this.add
      .text(pos.x + Phaser.Math.Between(-8, 8), pos.y + offset * this.fs(30), text, {
        fontFamily: Theme.font.display,
        fontSize: `${this.fs(size)}px`,
        color: toCss(color),
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.tweens.add({
      targets: label,
      y: label.y - this.fs(26),
      alpha: 0,
      duration: 620 / Math.max(1, this.speed * 0.6),
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private showPhaseBanner(text: string): void {
    const banner = this.label(this.W / 2, this.H * 0.3, text, {
      size: 22,
      color: Theme.color.legendary,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 3,
      wrap: this.W * 0.85,
    }).setDepth(950);
    banner.setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, duration: 200, yoyo: true, hold: 900, onComplete: () => banner.destroy() });
    if (!session.profile.settings.reduceMotion) this.cameras.main.shake(220, 0.006);
  }

  /* ---------------------------------------------------------------- */
  /* Resolution                                                        */
  /* ---------------------------------------------------------------- */

  private finishBattle(): void {
    if (this.phase === 'RESULT' || !this.engine) return;
    this.phase = 'RESULT';
    this.result = this.engine.result();
    const won = this.result.outcome === 'VICTORY';
    audio.play(won ? 'victory' : 'defeat');

    const messages = this.manager.applyBattleResult(this.fromEvent ? null : this.tileId, this.encounter, this.result);
    if (won && this.fromEvent) {
      this.manager.grantDuelReward();
      const tile = this.manager.view.get(this.tileId);
      if (tile) this.manager.fog.clearTile(tile);
    }
    void saveManager.flush();

    this.time.delayedCall(500, () => this.showResult(won, messages));
  }

  private showResult(won: boolean, messages: string[]): void {
    const survivors = this.manager.livingArmies.length;
    const runLost = this.manager.isRunLost();

    showModal(this, {
      title: won ? 'VICTORY' : 'THE LINE BREAKS',
      body: won
        ? `${this.result?.enemiesDefeated ?? 0} enemies defeated in ${(this.result?.durationSeconds ?? 0).toFixed(1)}s.`
        : runLost
          ? 'Every banner has fallen.'
          : 'Your armies are driven back.',
      notes: [...messages, won ? `${survivors} armies still standing.` : ''].filter(Boolean),
      accent: won ? Theme.color.gold : Theme.color.bad,
      actions: [
        {
          label: runLost ? 'SEE HOW FAR YOU GOT' : 'CONTINUE',
          variant: 'primary',
          onClick: () => {
            if (runLost) {
              session.endRun(false);
              this.goto('RunEnd', { won: false });
              return;
            }
            if (this.manager.pendingReward) {
              this.goto('Reward', { inline: true });
              return;
            }
            this.goto('Map', { messages: [] });
          },
        },
      ],
    });
  }
}
