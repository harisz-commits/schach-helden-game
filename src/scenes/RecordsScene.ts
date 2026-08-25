import { BaseScene } from '../ui/BaseScene';
import { registerDevBridge } from '../debug/DevBridge';
import { Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { ScrollView } from '../ui/components/ScrollView';
import { drawPanel } from '../ui/components/Panel';
import { session } from '../run/GameSession';
import { saveManager } from '../save/SaveManager';
import { audio } from '../audio/AudioManager';
import { KINGDOM_MASTERY } from '../data/achievements';
import { ROMAN } from '../data/ascensions';

type Tab = 'RECORDS' | 'ACHIEVEMENTS' | 'MASTERY';

/** Records, achievements and the Crown Shard shop, behind three tabs. */
export class RecordsScene extends BaseScene {
  private tab: Tab = 'RECORDS';
  private scroller?: ScrollView;

  constructor() {
    super('Records');
  }

  create(): void {
    session.refreshProfile();
    this.paintBackground(Theme.color.bg);
    this.buildHeader();
    this.buildTabs();
    this.buildBody();
    this.enableResponsiveLayout();
    this.fadeIn();
    registerDevBridge(this, { scene: 'Records' });
  }

  override update(): void {
    this.scroller?.tick();
  }

  private buildHeader(): void {
    this.label(this.W / 2, this.fs(26), 'RECORDS', {
      size: 22,
      color: Theme.color.gold,
      origin: [0.5, 0.5],
      align: 'center',
      letterSpacing: 6,
    });
    this.label(this.W / 2, this.fs(52), `${session.profile.crownShards} Crown Shards`, {
      size: 12,
      color: Theme.color.goldBright,
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

  private buildTabs(): void {
    const tabs: { id: Tab; label: string }[] = [
      { id: 'RECORDS', label: 'RECORDS' },
      { id: 'ACHIEVEMENTS', label: 'AWARDS' },
      { id: 'MASTERY', label: 'MASTERY' },
    ];
    const width = Math.min(this.W - this.fs(24), this.fs(420));
    const buttonWidth = width / tabs.length - this.fs(6);
    let x = this.W / 2 - width / 2 + buttonWidth / 2;
    for (const tab of tabs) {
      new Button(this, x, this.fs(84), {
        width: buttonWidth,
        height: this.fs(34),
        label: tab.label,
        variant: this.tab === tab.id ? 'primary' : 'ghost',
        fontSize: this.fs(12),
        onClick: () => {
          this.tab = tab.id;
          this.scene.restart();
        },
      });
      x += buttonWidth + this.fs(6);
    }
  }

  private buildBody(): void {
    const top = this.fs(108);
    const bottom = this.H - this.fs(16);
    const width = Math.min(this.W - this.fs(24), this.fs(560));
    const scroller = new ScrollView(this, this.W / 2 - width / 2, top, width, bottom - top);
    this.scroller = scroller;
    let y = 0;

    if (this.tab === 'RECORDS') y = this.buildRecords(scroller, width, y);
    else if (this.tab === 'ACHIEVEMENTS') y = this.buildAchievements(scroller, width, y);
    else y = this.buildMastery(scroller, width, y);

    scroller.setContentHeight(y + this.fs(12));
    scroller.refreshMask();
  }

  private row(scroller: ScrollView, width: number, y: number, left: string, right: string, color = Theme.color.text): number {
    const height = this.fs(34);
    const panel = this.add.graphics();
    drawPanel(panel, { width, height, fill: Theme.color.panel, border: Theme.color.border, radius: 7 });
    panel.setPosition(width / 2, y + height / 2);
    scroller.content.add(panel);
    scroller.content.add(
      this.label(this.fs(14), y + height / 2, left, { size: 13, color: Theme.color.textDim, font: 'body', origin: [0, 0.5] }),
    );
    scroller.content.add(
      this.label(width - this.fs(14), y + height / 2, right, { size: 13, color, origin: [1, 0.5] }),
    );
    return y + height + this.fs(6);
  }

  private buildRecords(scroller: ScrollView, width: number, y: number): number {
    const profile = session.profile;
    const stats = profile.totalStats;
    const rows: [string, string][] = [
      ['Deepest floor', `${profile.highestFloor}`],
      ['Highest Ascension cleared', profile.highestAscension > 0 ? ROMAN[profile.highestAscension]! : '—'],
      ['Deepest Endless floor', profile.highestEndlessFloor > 0 ? `${profile.highestEndlessFloor}` : '—'],
      ['Expeditions started', `${stats.runsStarted}`],
      ['Expeditions won', `${stats.runsWon}`],
      ['Enemies defeated', `${stats.enemiesDefeated}`],
      ['Elites defeated', `${stats.elitesDefeated}`],
      ['Guardians defeated', `${stats.guardiansDefeated}`],
      ['Treasures opened', `${stats.treasuresOpened}`],
      ['Relics used', `${stats.relicsUsed}`],
      ['Legendary blessings', `${stats.legendaryBlessings}`],
      ['Gold collected', `${stats.goldCollected}`],
    ];
    if (stats.bestRunTimeMs > 0) {
      const minutes = Math.floor(stats.bestRunTimeMs / 60000);
      const seconds = Math.floor((stats.bestRunTimeMs % 60000) / 1000);
      rows.push(['Fastest victory', `${minutes}:${`${seconds}`.padStart(2, '0')}`]);
    }
    if (profile.daily) {
      rows.push([`Daily best (${profile.daily.date})`, `${profile.daily.bestScore}`]);
    }
    for (const [left, right] of rows) y = this.row(scroller, width, y, left, right);
    return y;
  }

  private buildAchievements(scroller: ScrollView, width: number, y: number): number {
    for (const { def, unlocked } of session.progression.achievementList()) {
      const height = this.fs(52);
      const panel = this.add.graphics();
      drawPanel(panel, {
        width,
        height,
        fill: unlocked ? Theme.color.panelLight : Theme.color.panel,
        border: unlocked ? Theme.color.gold : Theme.color.border,
        radius: 7,
      });
      panel.setPosition(width / 2, y + height / 2);
      scroller.content.add(panel);
      scroller.content.add(
        this.label(this.fs(14), y + this.fs(11), def.name, {
          size: 14,
          color: unlocked ? Theme.color.goldBright : Theme.color.textDim,
        }),
      );
      scroller.content.add(
        this.label(this.fs(14), y + this.fs(31), def.description, {
          size: 11,
          color: Theme.color.textFaint,
          font: 'body',
          wrap: width - this.fs(90),
        }),
      );
      scroller.content.add(
        this.label(width - this.fs(14), y + height / 2, unlocked ? 'DONE' : `${def.crownShards}◆`, {
          size: 12,
          color: unlocked ? Theme.color.good : Theme.color.textFaint,
          font: 'body',
          origin: [1, 0.5],
        }),
      );
      y += height + this.fs(6);
    }
    return y;
  }

  private buildMastery(scroller: ScrollView, width: number, y: number): number {
    scroller.content.add(
      this.label(0, y, 'Small permanent advantages. Never raw power - the run still has to be earned.', {
        size: 11,
        color: Theme.color.textFaint,
        font: 'body',
        wrap: width,
      }),
    );
    y += this.fs(38);

    for (const def of [...KINGDOM_MASTERY].sort((a, b) => a.order - b.order)) {
      const owned = session.profile.kingdomMastery.includes(def.id);
      const affordable = session.progression.canBuyMastery(def.id);
      const height = this.fs(62);
      const panel = this.add.graphics();
      drawPanel(panel, {
        width,
        height,
        fill: owned ? Theme.color.panelLight : Theme.color.panel,
        border: owned ? Theme.color.gold : Theme.color.border,
        radius: 7,
      });
      panel.setPosition(width / 2, y + height / 2);
      scroller.content.add(panel);
      scroller.content.add(
        this.label(this.fs(14), y + this.fs(12), def.name, { size: 14, color: owned ? Theme.color.goldBright : Theme.color.text }),
      );
      scroller.content.add(
        this.label(this.fs(14), y + this.fs(32), def.description, {
          size: 11,
          color: Theme.color.textDim,
          font: 'body',
          wrap: width - this.fs(120),
        }),
      );

      const buttonY = y + height / 2;
      const button = new Button(this, width - this.fs(56), buttonY, {
        width: this.fs(92),
        height: this.fs(34),
        label: owned ? 'OWNED' : `${def.cost}◆`,
        variant: owned ? 'ghost' : 'primary',
        enabled: !owned && affordable,
        fontSize: this.fs(12),
        onClick: () => {
          if (session.progression.buyMastery(def.id)) {
            audio.play('unlock');
            saveManager.requestSave();
            this.scene.restart();
          }
        },
      });
      scroller.content.add(button);
      y += height + this.fs(6);
    }
    return y;
  }
}
