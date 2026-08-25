import { BaseScene } from '../ui/BaseScene';
import { registerDevBridge } from '../debug/DevBridge';
import { Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { ScrollView } from '../ui/components/ScrollView';
import { drawPanel } from '../ui/components/Panel';
import { session } from '../run/GameSession';
import { audio } from '../audio/AudioManager';
import { getHero } from '../data/heroes';
import { ROMAN } from '../data/ascensions';
import { GameConfig } from '../core/GameConfig';

interface SceneData {
  won: boolean;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

/**
 * Run summary. The point of this screen is momentum: show what was achieved,
 * show what is close to unlocking, and put TRY AGAIN under the player's thumb.
 */
export class RunEndScene extends BaseScene {
  private won = false;
  private scroller?: ScrollView;

  constructor() {
    super('RunEnd');
  }

  init(data: SceneData): void {
    this.won = data.won;
  }

  create(): void {
    this.paintBackground(Theme.color.bg, this.won ? Theme.color.gold : Theme.color.bad);
    audio.play(this.won ? 'victory' : 'defeat');
    this.buildHeader();
    this.buildBody();
    this.buildFooter();
    this.enableResponsiveLayout();
    this.fadeIn();
    registerDevBridge(this, { scene: 'RunEnd' });
  }

  override update(): void {
    this.scroller?.tick();
  }

  /** True only for the run that beat Floor 20 for the very first time. */
  private get isFirstVictory(): boolean {
    return this.won && session.profile.totalStats.runsWon === 1;
  }

  private buildHeader(): void {
    const cx = this.W / 2;
    const run = session.runManager?.run;
    const firstVictory = this.isFirstVictory;

    this.label(cx, this.fs(34), this.won ? 'THE CROWN IS TAKEN' : 'THE EXPEDITION HAS FALLEN', {
      size: 24,
      color: this.won ? Theme.color.goldBright : Theme.color.bad,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 3,
      wrap: this.W - 40,
    });

    if (firstVictory) {
      this.label(cx, this.fs(66), 'THE FIRST KING HAS FALLEN.\nBUT THE CROWN REMEMBERS.', {
        size: 13,
        color: Theme.color.gold,
        origin: [0.5, 0.5],
        align: 'center',
        wrap: this.W - 50,
      });
    } else if (run) {
      const mode =
        run.mode === 'ENDLESS' ? 'Endless Kingdom' : run.mode === 'DAILY' ? 'Daily Kingdom' : run.ascensionLevel > 0 ? `Ascension ${ROMAN[run.ascensionLevel]}` : 'Normal expedition';
      this.label(cx, this.fs(62), mode, {
        size: 12,
        color: Theme.color.textDim,
        font: 'body',
        origin: [0.5, 0.5],
        align: 'center',
      });
    }
  }

  private buildBody(): void {
    const run = session.runManager?.run;
    if (!run) return;
    const outcome = session.lastOutcome;
    const top = this.fs(92);
    const bottom = this.H - this.fs(104);
    const width = Math.min(this.W - this.fs(24), this.fs(520));
    const scroller = new ScrollView(this, this.W / 2 - width / 2, top, width, bottom - top);
    this.scroller = scroller;
    let y = 0;

    // The first clear is the moment the game opens up - lead with that.
    if (this.isFirstVictory) {
      y = this.buildSection(scroller, width, y, 'THE KINGDOM OPENS', [
        ['Ascension I–X', 'UNLOCKED'],
        ['Lieutenant system', 'UNLOCKED'],
        ['Seraph, the Last Bastion', 'UNLOCKED'],
        ['New blessings', 'UNLOCKED'],
        ['New events', 'UNLOCKED'],
        ['Daily Kingdom', 'UNLOCKED'],
      ]);
    }

    const stats: [string, string][] = [
      ['Floor reached', `${run.floor}${run.mode === 'ENDLESS' ? '' : ` / ${GameConfig.run.totalFloors}`}`],
      ['Enemies defeated', `${run.runStats.enemiesDefeated}`],
      ['Guardians defeated', `${run.runStats.guardiansDefeated}`],
      ['Blessings collected', `${run.runStats.blessingsCollected}`],
      ['Relics used', `${run.runStats.relicsUsed}`],
      ['Gold collected', `${run.runStats.goldCollected}`],
      ['Run time', formatTime(run.elapsedMs)],
    ];
    if (run.mode === 'DAILY') stats.push(['Daily score', `${session.dailyScore()}`]);

    y = this.buildSection(scroller, width, y, 'EXPEDITION LOG', stats);

    const armyRows: [string, string][] = run.armies.map((army) => [
      getHero(army.heroId).name,
      army.alive ? `${Math.round(army.hpRatio * 100)}% HP` : 'Fallen',
    ]);
    y = this.buildSection(scroller, width, y, 'ARMIES', armyRows);

    if (outcome?.newRecord) {
      y = this.buildBanner(scroller, width, y, 'NEW RECORD', Theme.color.goldBright);
    }
    if (outcome && outcome.crownShards > 0) {
      y = this.buildBanner(scroller, width, y, `+${outcome.crownShards} CROWN SHARDS`, Theme.color.gold);
    }
    for (const heroId of outcome?.heroesUnlocked ?? []) {
      y = this.buildBanner(scroller, width, y, `${getHero(heroId).name.toUpperCase()} UNLOCKED`, Theme.color.legendary);
    }
    for (const mastery of outcome?.masteryUnlocked ?? []) {
      y = this.buildBanner(
        scroller,
        width,
        y,
        `${getHero(mastery.heroId).name} — Mastery ${ROMAN[mastery.tier]}: ${mastery.reward}`,
        Theme.color.rare,
      );
    }

    // What is closest to unlocking next - the reason to press TRY AGAIN.
    const upcoming = session.progression
      .heroProgress()
      .filter((entry) => !entry.unlocked && entry.required > 0)
      .sort((a, b) => b.current / b.required - a.current / a.required)
      .slice(0, 3);
    if (upcoming.length > 0) {
      y = this.buildSection(
        scroller,
        width,
        y,
        'NEXT TO JOIN YOU',
        upcoming.map((entry) => [
          entry.hero.name,
          entry.required > 1 && entry.current < entry.required
            ? `${entry.label}  (${Math.min(entry.current, entry.required)} / ${entry.required})`
            : entry.label,
        ]),
      );
    }

    scroller.setContentHeight(y + this.fs(10));
    scroller.refreshMask();
  }

  private buildSection(
    scroller: ScrollView,
    width: number,
    y: number,
    title: string,
    rows: [string, string][],
  ): number {
    const header = this.label(0, y, title, {
      size: 11,
      color: Theme.color.textFaint,
      font: 'body',
      letterSpacing: 4,
    });
    scroller.content.add(header);
    y += this.fs(22);

    const height = rows.length * this.fs(26) + this.fs(14);
    const panel = this.add.graphics();
    drawPanel(panel, { width, height, fill: Theme.color.panel, border: Theme.color.border });
    panel.setPosition(width / 2, y + height / 2);
    scroller.content.add(panel);

    let rowY = y + this.fs(15);
    for (const [key, value] of rows) {
      scroller.content.add(this.label(this.fs(14), rowY, key, { size: 13, color: Theme.color.textDim, font: 'body' }));
      scroller.content.add(
        this.label(width - this.fs(14), rowY, value, {
          size: 13,
          color: value === 'UNLOCKED' ? Theme.color.goldBright : Theme.color.text,
          origin: [1, 0],
        }),
      );
      rowY += this.fs(26);
    }
    return y + height + this.fs(16);
  }

  private buildBanner(scroller: ScrollView, width: number, y: number, text: string, color: number): number {
    const height = this.fs(40);
    const panel = this.add.graphics();
    drawPanel(panel, { width, height, fill: Theme.color.panelLight, border: color, radius: 8 });
    panel.setPosition(width / 2, y + height / 2);
    scroller.content.add(panel);
    scroller.content.add(
      this.label(width / 2, y + height / 2, text, {
        size: 13,
        color,
        origin: [0.5, 0.5],
        align: 'center',
        letterSpacing: 2,
        wrap: width - this.fs(24),
      }),
    );
    return y + height + this.fs(10);
  }

  private buildFooter(): void {
    const cx = this.W / 2;
    const width = Math.min(this.fs(320), this.W - 40);

    new Button(this, cx, this.H - this.fs(62), {
      width,
      height: Math.max(Theme.touch + 4, this.fs(54)),
      label: this.won ? 'START NEW EXPEDITION' : 'TRY AGAIN',
      variant: 'primary',
      onClick: () => {
        session.runManager = null;
        this.goto('HeroSelect', { mode: 'NORMAL' });
      },
    });

    new Button(this, cx, this.H - this.fs(22), {
      width,
      height: this.fs(34),
      label: 'MAIN MENU',
      variant: 'ghost',
      fontSize: this.fs(13),
      onClick: () => {
        session.runManager = null;
        this.goto('MainMenu');
      },
    });
  }
}
