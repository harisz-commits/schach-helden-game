import Phaser from 'phaser';
import type { GameMode, HeroDefinition } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { ScrollView } from '../ui/components/ScrollView';
import { drawPanel } from '../ui/components/Panel';
import { showModal } from '../ui/overlays/Modal';
import { ensureUnitTexture } from '../ui/Sprites';
import { session } from '../run/GameSession';
import { getHero } from '../data/heroes';
import { ROMAN, ascension } from '../data/ascensions';
import { GameConfig } from '../core/GameConfig';

interface SceneData {
  mode?: GameMode;
}

const CLASS_LABEL: Record<string, string> = {
  GUARDIAN: 'Guardian',
  WARRIOR: 'Warrior',
  RIDER: 'Rider',
  RANGER: 'Ranger',
  ARCANIST: 'Arcanist',
  SUPPORT: 'Support',
};

/**
 * New run flow: difficulty -> heroes -> lieutenants -> start.
 * Everything lives on one screen so a run is never more than a few taps away.
 */
export class HeroSelectScene extends BaseScene {
  private mode: GameMode = 'NORMAL';
  private ascensionLevel = 0;
  private selected: string[] = [];
  private lieutenants: Record<string, string> = {};
  private scroller?: ScrollView;
  private countLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('HeroSelect');
  }

  init(data: SceneData): void {
    this.mode = data.mode ?? 'NORMAL';
    if (this.selected.length === 0) {
      this.selected = session.profile.unlockedHeroes.slice(0, GameConfig.run.baseArmySlots);
    }
  }

  create(): void {
    this.paintBackground(Theme.color.bg);
    this.buildHeader();
    this.buildRoster();
    this.buildFooter();
    this.enableResponsiveLayout();
    this.fadeIn();
  }

  override update(): void {
    this.scroller?.tick();
  }

  private get maxHeroes(): number {
    return GameConfig.run.baseArmySlots;
  }

  private buildHeader(): void {
    const cx = this.W / 2;
    const title =
      this.mode === 'ENDLESS' ? 'ENDLESS KINGDOM' : this.mode === 'DAILY' ? 'DAILY KINGDOM' : 'NEW EXPEDITION';
    this.label(cx, this.fs(28), title, {
      size: 22,
      color: Theme.color.gold,
      origin: [0.5, 0.5],
      letterSpacing: 5,
      align: 'center',
    });

    this.countLabel = this.label(cx, this.fs(54), '', {
      size: 13,
      color: Theme.color.textDim,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
    });
    this.updateCount();

    new Button(this, this.fs(46), this.fs(28), {
      width: this.fs(70),
      height: this.fs(34),
      label: 'BACK',
      variant: 'ghost',
      fontSize: this.fs(13),
      onClick: () => this.goto('MainMenu'),
    });

    if (this.mode === 'NORMAL' && session.progression.hasFeature('ASCENSION')) {
      const max = session.progression.maxSelectableAscension();
      new Button(this, this.W - this.fs(64), this.fs(28), {
        width: this.fs(110),
        height: this.fs(34),
        label: this.ascensionLevel === 0 ? 'NORMAL' : `ASCENSION ${ROMAN[this.ascensionLevel]}`,
        variant: this.ascensionLevel > 0 ? 'primary' : 'ghost',
        fontSize: this.fs(12),
        onClick: () => this.pickAscension(max),
      });
    }
  }

  private pickAscension(max: number): void {
    const options = [];
    for (let level = 0; level <= max; level++) {
      const def = ascension(level);
      options.push({
        label: level === 0 ? 'NORMAL' : `ASCENSION ${ROMAN[level]}`,
        sublabel: def.description,
        variant: (level === this.ascensionLevel ? 'primary' : 'secondary') as 'primary' | 'secondary',
        onClick: () => {
          this.ascensionLevel = level;
          this.scene.restart();
        },
      });
    }
    showModal(this, {
      title: 'Choose your difficulty',
      body: 'Each Ascension makes the kingdom harder and changes its rules.',
      dismissible: true,
      maxWidth: 620,
      actions: options.slice(0, 6),
    });
  }

  private updateCount(): void {
    if (!this.countLabel) return;
    const asc = this.ascensionLevel > 0 ? ` · Ascension ${ROMAN[this.ascensionLevel]}` : '';
    this.countLabel.setText(`Choose ${this.maxHeroes} armies  ·  ${this.selected.length}/${this.maxHeroes} selected${asc}`);
  }

  private buildRoster(): void {
    const unlocked = session.profile.unlockedHeroes.map((id) => getHero(id));
    const top = this.fs(76);
    const bottom = this.H - this.fs(86);
    const viewWidth = Math.min(this.W - 24, this.fs(720));
    const columns = viewWidth > this.fs(520) ? 2 : 1;
    const cardWidth = (viewWidth - (columns - 1) * this.fs(10)) / columns;
    const cardHeight = this.fs(92);
    const gap = this.fs(10);

    const scroller = new ScrollView(this, this.W / 2 - viewWidth / 2, top, viewWidth, bottom - top);
    this.scroller = scroller;

    unlocked.forEach((hero, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (cardWidth + gap) + cardWidth / 2;
      const y = row * (cardHeight + gap) + cardHeight / 2;
      scroller.content.add(this.buildHeroCard(hero, x, y, cardWidth, cardHeight));
    });

    const rows = Math.ceil(unlocked.length / columns);
    scroller.setContentHeight(rows * (cardHeight + gap) + this.fs(8));
    scroller.refreshMask();
  }

  private buildHeroCard(
    hero: HeroDefinition,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const selectedIndex = this.selected.indexOf(hero.id);
    const isSelected = selectedIndex >= 0;

    const g = this.add.graphics();
    drawPanel(g, {
      width,
      height,
      fill: isSelected ? Theme.color.panelLight : Theme.color.panel,
      border: isSelected ? Theme.color.gold : Theme.color.border,
      inset: isSelected,
    });
    container.add(g);

    const key = ensureUnitTexture(this, hero.art.shape, hero.art.color, hero.art.accent);
    const portrait = this.add.image(-width / 2 + this.fs(36), 0, key).setDisplaySize(this.fs(48), this.fs(61));
    container.add(portrait);

    const textX = -width / 2 + this.fs(70);
    container.add(
      this.label(textX, -height / 2 + this.fs(14), hero.name.toUpperCase(), {
        size: 16,
        color: isSelected ? Theme.color.goldBright : Theme.color.text,
        letterSpacing: 2,
      }),
    );
    const classes = [hero.heroClass, hero.secondaryClass].filter(Boolean).map((c) => CLASS_LABEL[c!] ?? c);
    container.add(
      this.label(textX, -height / 2 + this.fs(36), `${classes.join(' / ')}  ·  ${hero.preferredRow === 'FRONT' ? 'Front' : 'Back'} row`, {
        size: 11,
        color: Theme.color.textDim,
        font: 'body',
      }),
    );
    container.add(
      this.label(textX, -height / 2 + this.fs(54), hero.activeSkill.name, {
        size: 12,
        color: Theme.color.gold,
        font: 'body',
        wrap: width - this.fs(90),
      }),
    );

    const tier = session.profile.heroMastery[hero.id]?.tier ?? 1;
    container.add(
      this.label(width / 2 - this.fs(12), height / 2 - this.fs(14), `MASTERY ${ROMAN[tier]}`, {
        size: 10,
        color: Theme.color.textFaint,
        font: 'body',
        origin: [1, 0.5],
      }),
    );

    if (isSelected) {
      const badge = this.add.graphics();
      badge.fillStyle(Theme.color.gold, 1);
      badge.fillCircle(width / 2 - this.fs(18), -height / 2 + this.fs(18), this.fs(12));
      container.add(badge);
      container.add(
        this.label(width / 2 - this.fs(18), -height / 2 + this.fs(18), `${selectedIndex + 1}`, {
          size: 13,
          color: Theme.color.bg,
          origin: [0.5, 0.5],
          align: 'center',
        }),
      );
    }

    const hit = this.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    let downAt = { x: 0, y: 0 };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y };
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 12) return;
      this.toggleHero(hero.id);
    });
    container.add(hit);

    return container;
  }

  private toggleHero(heroId: string): void {
    const index = this.selected.indexOf(heroId);
    if (index >= 0) {
      this.selected.splice(index, 1);
      delete this.lieutenants[heroId];
    } else {
      if (this.selected.length >= this.maxHeroes) {
        this.toast(`You can only take ${this.maxHeroes} armies.`, 'bad');
        return;
      }
      this.selected.push(heroId);
    }
    this.scene.restart();
  }

  private buildFooter(): void {
    const cx = this.W / 2;
    const y = this.H - this.fs(44);
    const width = Math.min(this.fs(320), this.W - 40);
    const ready = this.selected.length === this.maxHeroes;

    new Button(this, cx, y, {
      width,
      height: Math.max(Theme.touch + 4, this.fs(54)),
      label: 'ENTER THE KINGDOM',
      ...(ready ? {} : { sublabel: `Select ${this.maxHeroes - this.selected.length} more` }),
      variant: 'primary',
      enabled: ready,
      onClick: () => this.startRun(),
    });

    if (session.progression.hasFeature('LIEUTENANTS') && this.selected.length > 0) {
      new Button(this, cx, y - this.fs(58), {
        width,
        height: this.fs(38),
        label: 'ASSIGN LIEUTENANTS',
        sublabel: `${Object.keys(this.lieutenants).length} assigned`,
        variant: 'ghost',
        fontSize: this.fs(13),
        onClick: () => this.openLieutenants(),
      });
    }
  }

  private openLieutenants(): void {
    const captains = this.selected.map((id) => getHero(id));
    showModal(this, {
      title: 'Lieutenants',
      body: 'A lieutenant lends their passive to a captain at reduced strength.',
      dismissible: true,
      maxWidth: 620,
      actions: captains.slice(0, 6).map((captain) => ({
        label: captain.name,
        sublabel: this.lieutenants[captain.id]
          ? `Lieutenant: ${getHero(this.lieutenants[captain.id]!).name}`
          : 'No lieutenant',
        onClick: () => this.pickLieutenant(captain.id),
      })),
    });
  }

  private pickLieutenant(captainId: string): void {
    const taken = new Set(Object.values(this.lieutenants));
    const options = session.profile.unlockedHeroes
      .filter((id) => !this.selected.includes(id) && (!taken.has(id) || this.lieutenants[captainId] === id))
      .slice(0, 5);

    showModal(this, {
      title: `Lieutenant for ${getHero(captainId).name}`,
      dismissible: true,
      maxWidth: 620,
      actions: [
        ...options.map((id) => {
          const hero = getHero(id);
          return {
            label: hero.name,
            sublabel: hero.passiveSkills[0]?.description ?? '',
            onClick: () => {
              this.lieutenants[captainId] = id;
              this.scene.restart();
            },
          };
        }),
        {
          label: 'NONE',
          variant: 'ghost' as const,
          onClick: () => {
            delete this.lieutenants[captainId];
            this.scene.restart();
          },
        },
      ],
    });
  }

  private startRun(): void {
    const lieutenants = Object.keys(this.lieutenants).length > 0 ? this.lieutenants : undefined;
    if (this.mode === 'DAILY') {
      session.startDailyRun(this.selected);
    } else {
      session.startRun({
        heroIds: this.selected,
        mode: this.mode,
        ascensionLevel: this.mode === 'NORMAL' ? this.ascensionLevel : 0,
        ...(lieutenants ? { lieutenantIds: lieutenants } : {}),
      });
    }
    this.goto('Map');
  }
}
