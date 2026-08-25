import Phaser from 'phaser';
import type { HeroDefinition } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { ScrollView } from '../ui/components/ScrollView';
import { drawPanel } from '../ui/components/Panel';
import { closeTopModal, showModal } from '../ui/overlays/Modal';
import { ensureUnitTexture } from '../ui/Sprites';
import { session } from '../run/GameSession';
import { ROMAN } from '../data/ascensions';

/**
 * Hero collection. Locked heroes stay visible with their exact requirement, so
 * the player always knows what to chase next.
 */
export class CollectionScene extends BaseScene {
  private scroller?: ScrollView;

  constructor() {
    super('Collection');
  }

  create(): void {
    session.refreshProfile();
    this.paintBackground(Theme.color.bg);
    this.buildHeader();
    this.buildList();
    this.enableResponsiveLayout();
    this.fadeIn();
  }

  override update(): void {
    this.scroller?.tick();
  }

  private buildHeader(): void {
    const profile = session.profile;
    this.label(this.W / 2, this.fs(26), 'HEROES', {
      size: 22,
      color: Theme.color.gold,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 6,
    });
    this.label(this.W / 2, this.fs(52), `${profile.unlockedHeroes.length} / 20 recruited`, {
      size: 12,
      color: Theme.color.textDim,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
    });
    new Button(this, this.fs(44), this.fs(26), {
      width: this.fs(66),
      height: this.fs(32),
      label: 'BACK',
      variant: 'ghost',
      fontSize: this.fs(12),
      onClick: () => this.goto('MainMenu'),
    });
  }

  private buildList(): void {
    const entries = session.progression.heroProgress();
    const top = this.fs(74);
    const bottom = this.H - this.fs(16);
    const viewWidth = Math.min(this.W - 20, this.fs(720));
    const columns = viewWidth > this.fs(520) ? 2 : 1;
    const gap = this.fs(10);
    const cardWidth = (viewWidth - (columns - 1) * gap) / columns;
    const cardHeight = this.fs(98);

    const scroller = new ScrollView(this, this.W / 2 - viewWidth / 2, top, viewWidth, bottom - top);
    this.scroller = scroller;

    entries.forEach((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (cardWidth + gap) + cardWidth / 2;
      const y = row * (cardHeight + gap) + cardHeight / 2;
      scroller.content.add(this.buildCard(entry, x, y, cardWidth, cardHeight));
    });

    scroller.setContentHeight(Math.ceil(entries.length / columns) * (cardHeight + gap) + this.fs(8));
    scroller.refreshMask();
  }

  private buildCard(
    entry: { hero: HeroDefinition; unlocked: boolean; current: number; required: number; label: string },
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const { hero, unlocked } = entry;
    const container = this.add.container(x, y);

    const g = this.add.graphics();
    drawPanel(g, {
      width,
      height,
      fill: unlocked ? Theme.color.panel : Theme.color.bgAlt,
      border: unlocked ? Theme.color.borderBright : Theme.color.border,
    });
    container.add(g);

    const key = ensureUnitTexture(this, hero.art.shape, hero.art.color, hero.art.accent);
    const portrait = this.add.image(-width / 2 + this.fs(38), 0, key).setDisplaySize(this.fs(50), this.fs(64));
    if (!unlocked) portrait.setTint(0x2a2a2a);
    container.add(portrait);

    const textX = -width / 2 + this.fs(74);
    container.add(
      this.label(textX, -height / 2 + this.fs(12), unlocked ? hero.name.toUpperCase() : '???', {
        size: 16,
        color: unlocked ? Theme.color.goldBright : Theme.color.textFaint,
        letterSpacing: 2,
      }),
    );
    container.add(
      this.label(textX, -height / 2 + this.fs(34), unlocked ? hero.title : hero.heroClass, {
        size: 11,
        color: Theme.color.textDim,
        font: 'body',
        wrap: width - this.fs(96),
      }),
    );

    if (unlocked) {
      const tier = session.profile.heroMastery[hero.id]?.tier ?? 1;
      container.add(
        this.label(textX, height / 2 - this.fs(28), `MASTERY ${ROMAN[tier]} / V`, {
          size: 11,
          color: Theme.color.gold,
          font: 'body',
        }),
      );
      const progress = session.progression.masteryProgress(hero.id);
      if (progress.next) {
        const pct = Math.min(1, progress.next.current / Math.max(1, progress.next.required));
        const barWidth = width - this.fs(90);
        const bar = this.add.graphics();
        bar.fillStyle(Theme.color.bgAlt, 1);
        bar.fillRoundedRect(textX, height / 2 - this.fs(14), barWidth, this.fs(5), 2);
        bar.fillStyle(Theme.color.gold, 1);
        bar.fillRoundedRect(textX, height / 2 - this.fs(14), Math.max(2, barWidth * pct), this.fs(5), 2);
        container.add(bar);
      }
    } else {
      const showCount = entry.required > 1;
      container.add(
        this.label(textX, height / 2 - this.fs(26), 'LOCKED', {
          size: 10,
          color: Theme.color.bad,
          font: 'body',
          letterSpacing: 3,
        }),
      );
      container.add(
        this.label(
          textX,
          height / 2 - this.fs(12),
          showCount ? `${entry.label}  (${Math.min(entry.current, entry.required)} / ${entry.required})` : entry.label,
          { size: 11, color: Theme.color.textDim, font: 'body', wrap: width - this.fs(90) },
        ),
      );
    }

    const hit = this.add.rectangle(0, 0, width, height, 0x000000, 0).setInteractive({ useHandCursor: true });
    let downAt = { x: 0, y: 0 };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y };
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 12) return;
      this.showHero(entry);
    });
    container.add(hit);

    return container;
  }

  private showHero(entry: { hero: HeroDefinition; unlocked: boolean; current: number; required: number; label: string }): void {
    const hero = entry.hero;
    const progress = session.progression.masteryProgress(hero.id);
    const notes: string[] = [];

    if (!entry.unlocked) {
      notes.push(`LOCKED — ${entry.label}`);
      if (entry.required > 1) notes.push(`Progress: ${Math.min(entry.current, entry.required)} / ${entry.required}`);
    }
    notes.push(`${hero.activeSkill.name}: ${hero.activeSkill.description}`);
    for (const passive of hero.passiveSkills) notes.push(`${passive.name}: ${passive.description}`);
    if (entry.unlocked) {
      notes.push('');
      for (const tier of hero.mastery) {
        const reached = tier.tier <= progress.tier;
        notes.push(`${reached ? '✓' : '·'} Mastery ${ROMAN[tier.tier]} — ${tier.label} → ${tier.reward}`);
      }
      if (progress.next) {
        notes.push(`Next: ${progress.next.current} / ${progress.next.required}`);
      }
    }

    showModal(this, {
      title: entry.unlocked ? hero.name : '???',
      body: entry.unlocked ? `${hero.title}\n${hero.lore}` : hero.heroClass,
      notes,
      dismissible: true,
      maxWidth: 640,
      accent: entry.unlocked ? Theme.color.gold : Theme.color.border,
      actions: [{ label: 'CLOSE', variant: 'ghost', onClick: () => closeTopModal(this) }],
    });
  }
}
