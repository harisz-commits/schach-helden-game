import Phaser from 'phaser';
import type { BlessingDefinition, PendingReward } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { RARITY_COLOR, Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { drawPanel } from '../ui/components/Panel';
import { closeTopModal, showModal } from '../ui/overlays/Modal';
import { session } from '../run/GameSession';
import { saveManager } from '../save/SaveManager';
import { audio } from '../audio/AudioManager';
import { getBlessing } from '../data/blessings';
import { getRelic } from '../data/relics';
import { GameConfig } from '../core/GameConfig';
import type { RunManager } from '../run/RunManager';
import { registerDevBridge } from '../debug/DevBridge';

interface SceneData {
  /** Inline offers come from shrines, altars and merchants and do not advance the floor. */
  inline?: boolean;
}

/**
 * The one-of-three blessing pick, plus the checkpoint golden chest.
 * This is the screen the whole build system hangs off, so the cards are large
 * and readable even on a small phone.
 */
export class RewardScene extends BaseScene {
  private manager!: RunManager;
  private inline = false;
  private offer!: PendingReward;

  constructor() {
    super('Reward');
  }

  init(data: SceneData): void {
    this.inline = data.inline ?? false;
  }

  create(): void {
    const manager = session.runManager;
    if (!manager) {
      this.scene.start('MainMenu');
      return;
    }
    this.manager = manager;

    // Only mint a new offer when there is not one already in flight. A reroll
    // restarts this scene, and regenerating here would silently discard it.
    if (!manager.pendingReward) {
      if (this.inline) {
        this.goto('Map');
        return;
      }
      manager.run.pendingReward =
        manager.isCheckpointFloor() ? manager.createCheckpointChest() : manager.createBlessingOffer();
    }
    this.offer = manager.pendingReward!;

    this.paintBackground(Theme.color.bg, Theme.color.gold);
    this.buildHeader();
    this.buildCards();
    this.buildFooter();
    this.enableResponsiveLayout();
    this.fadeIn();
    audio.play('reward');
    registerDevBridge({
      scene: 'Reward',
      offers: () => this.offer.blessingIds,
      pick: (index: number) => {
        const id = this.offer.blessingIds[index] ?? this.offer.blessingIds[0];
        if (id) this.choose(getBlessing(id));
      },
    });

    // The chest is claimed once per floor, never again on a reroll restart.
    if (this.offer.kind === 'CHECKPOINT' && this.offer.chest && manager.run.flags.chestClaimedFloor !== manager.floor) {
      this.time.delayedCall(200, () => this.openChest());
    }
  }

  private buildHeader(): void {
    const cx = this.W / 2;
    const isCheckpoint = this.offer.kind === 'CHECKPOINT';
    this.label(cx, this.fs(30), isCheckpoint ? 'A MILESTONE' : 'CHOOSE A BLESSING', {
      size: 22,
      color: Theme.color.goldBright,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 4,
    });
    const subtitle = this.inline
      ? 'The kingdom offers you a gift.'
      : `Floor ${this.manager.floor} cleared. It will hold for the rest of the run.`;
    this.label(cx, this.fs(56), subtitle, {
      size: 12,
      color: Theme.color.textDim,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
      wrap: this.W - 40,
    });
  }

  private buildCards(): void {
    const defs = this.offer.blessingIds.map((id) => getBlessing(id));
    const top = this.fs(84);
    const bottom = this.H - this.fs(96);
    const available = bottom - top;
    const horizontal = this.W > this.fs(680);

    if (horizontal) {
      const cardWidth = Math.min(this.fs(220), (this.W - this.fs(40)) / defs.length - this.fs(10));
      const cardHeight = Math.min(available, this.fs(300));
      const totalWidth = defs.length * cardWidth + (defs.length - 1) * this.fs(12);
      let x = this.W / 2 - totalWidth / 2 + cardWidth / 2;
      for (const def of defs) {
        this.buildCard(def, x, top + available / 2, cardWidth, cardHeight);
        x += cardWidth + this.fs(12);
      }
      return;
    }

    const cardWidth = Math.min(this.W - this.fs(32), this.fs(420));
    const gap = this.fs(10);
    const cardHeight = Math.min(this.fs(132), (available - gap * (defs.length - 1)) / defs.length);
    let y = top + (available - (cardHeight * defs.length + gap * (defs.length - 1))) / 2 + cardHeight / 2;
    for (const def of defs) {
      this.buildCard(def, this.W / 2, y, cardWidth, cardHeight);
      y += cardHeight + gap;
    }
  }

  private buildCard(def: BlessingDefinition, x: number, y: number, width: number, height: number): void {
    const container = this.add.container(x, y);
    const accent = RARITY_COLOR[def.rarity];
    const owned = this.manager.run.blessings.find((b) => b.id === def.id);

    const g = this.add.graphics();
    drawPanel(g, { width, height, fill: Theme.color.panel, border: accent, radius: 12, inset: true });
    container.add(g);

    const stripe = this.add.graphics();
    stripe.fillStyle(accent, 0.16);
    stripe.fillRoundedRect(-width / 2 + 6, -height / 2 + 6, width - 12, this.fs(24), 6);
    container.add(stripe);

    container.add(
      this.label(0, -height / 2 + this.fs(18), def.rarity, {
        size: 10,
        color: accent,
        font: 'body',
        origin: [0.5, 0.5],
        align: 'center',
        letterSpacing: 4,
      }),
    );
    container.add(
      this.label(0, -height / 2 + this.fs(44), def.name.toUpperCase(), {
        size: 17,
        color: Theme.color.goldBright,
        origin: [0.5, 0.5],
        align: 'center',
        letterSpacing: 1,
        wrap: width - this.fs(24),
      }),
    );
    container.add(
      this.label(0, -height / 2 + this.fs(72), def.description, {
        size: 13,
        color: Theme.color.text,
        font: 'body',
        origin: [0.5, 0],
        align: 'center',
        wrap: width - this.fs(28),
      }),
    );

    const footer = height / 2 - this.fs(14);
    const tagLine = def.tags.slice(0, 3).join(' · ');
    container.add(
      this.label(0, footer, owned ? `${tagLine}   ·   OWNED x${owned.stacks}/${def.maxStacks}` : tagLine, {
        size: 9,
        color: owned ? Theme.color.warn : Theme.color.textFaint,
        font: 'body',
        origin: [0.5, 0.5],
        align: 'center',
        letterSpacing: 1,
      }),
    );

    const hit = this.add.rectangle(0, 0, width, height, 0x000000, 0).setInteractive({ useHandCursor: true });
    let downAt = { x: 0, y: 0 };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y };
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 12) return;
      this.choose(def);
    });
    hit.on('pointerover', () => g.setAlpha(0.85));
    hit.on('pointerout', () => g.setAlpha(1));
    container.add(hit);
  }

  private buildFooter(): void {
    const cx = this.W / 2;
    const y = this.H - this.fs(48);
    const rerolls = this.manager.rerollsLeft;

    new Button(this, cx, y, {
      width: Math.min(this.fs(300), this.W - 40),
      height: this.fs(44),
      label: rerolls > 0 ? `REROLL  (${rerolls} left)` : 'NO REROLLS LEFT',
      variant: rerolls > 0 ? 'secondary' : 'ghost',
      enabled: rerolls > 0,
      fontSize: this.fs(14),
      onClick: () => {
        if (this.manager.rerollBlessings()) {
          audio.play('click');
          this.offer = this.manager.pendingReward!;
          this.scene.restart({ inline: this.inline });
        }
      },
    });
  }

  private choose(def: BlessingDefinition): void {
    audio.play('reward');
    this.manager.chooseBlessing(def.id);
    this.toast(`${def.name} joins the expedition.`, 'good');
    void saveManager.flush();
    this.time.delayedCall(220, () => this.finish());
  }

  private finish(): void {
    if (this.inline) {
      this.goto('Map', { messages: [] });
      return;
    }
    this.manager.advanceFloor();
    const outcome = session.onFloorReached();
    void saveManager.flush();

    const notes: string[] = [];
    for (const heroId of outcome?.heroesUnlocked ?? []) {
      notes.push(`NEW HERO: ${heroId.toUpperCase()}`);
    }
    for (const achievement of outcome?.achievementsUnlocked ?? []) {
      const def = session.progression.achievementById(achievement);
      if (def) notes.push(`ACHIEVEMENT: ${def.name}`);
    }

    if (notes.length > 0) {
      audio.play('unlock');
      showModal(this, {
        title: 'The kingdom takes notice',
        notes,
        accent: Theme.color.goldBright,
        actions: [
          {
            label: 'CONTINUE',
            variant: 'primary',
            onClick: () => {
              closeTopModal(this);
              this.goto('Map', { banner: `FLOOR ${this.manager.floor}` });
            },
          },
        ],
      });
      return;
    }

    this.goto('Map', { banner: `FLOOR ${this.manager.floor}` });
  }

  private openChest(): void {
    const chest = this.offer.chest;
    if (!chest) return;
    this.manager.run.flags.chestClaimedFloor = this.manager.floor;
    const messages = this.manager.claimCheckpointChest(chest);
    audio.play('unlock');
    showModal(this, {
      title: 'GOLDEN CHEST',
      body: `Floor ${this.manager.floor} of ${GameConfig.run.totalFloors} cleared.`,
      notes: [...messages, ...chest.relicIds.map((id) => getRelic(id).description)],
      accent: Theme.color.legendary,
      actions: [{ label: 'CLAIM', variant: 'primary', onClick: () => closeTopModal(this) }],
    });
  }
}
