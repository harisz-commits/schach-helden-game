import type { GameMode } from '../core/types';
import { BaseScene } from '../ui/BaseScene';
import { Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { ScrollView } from '../ui/components/ScrollView';
import { showModal } from '../ui/overlays/Modal';
import { session } from '../run/GameSession';
import { saveManager } from '../save/SaveManager';
import { audio } from '../audio/AudioManager';
import { ROMAN } from '../data/ascensions';
import { GameConfig } from '../core/GameConfig';
import { createDailySeed } from '../core/RNG';

export class MainMenuScene extends BaseScene {
  private scroller?: ScrollView;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    session.refreshProfile();
    this.paintBackground(Theme.color.bg, Theme.color.gold);
    this.buildTitle();
    this.buildMenu();
    this.buildFooter();
    this.enableResponsiveLayout();
    this.fadeIn();
  }

  override update(): void {
    this.scroller?.tick();
  }

  private buildTitle(): void {
    const cx = this.W / 2;
    const top = Math.min(this.H * 0.11, this.fs(96));

    this.label(cx, top, 'CROWNBOUND', {
      size: 40,
      color: Theme.color.gold,
      origin: [0.5, 0.5],
      letterSpacing: 8,
      align: 'center',
    });
    this.label(cx, top + this.fs(30), 'AN EXPEDITION INTO THE KINGDOM', {
      size: 11,
      color: Theme.color.textFaint,
      font: 'body',
      origin: [0.5, 0.5],
      letterSpacing: 4,
      align: 'center',
    });

    const g = this.add.graphics();
    g.lineStyle(1, Theme.color.borderBright, 0.7);
    g.lineBetween(cx - this.fs(90), top + this.fs(48), cx + this.fs(90), top + this.fs(48));
  }

  private buildMenu(): void {
    const profile = session.profile;
    const progression = session.progression;
    const cx = this.W / 2;
    const top = Math.min(this.H * 0.11, this.fs(96)) + this.fs(70);
    const bottom = this.H - this.fs(52);
    const width = Math.min(this.fs(360), this.W - 40);
    const height = Math.max(Theme.touch + 6, this.fs(56));
    const gap = this.fs(12);

    const entries: { label: string; sublabel?: string; variant?: 'primary' | 'secondary' | 'ghost'; onClick: () => void }[] = [];

    if (session.hasSavedRun()) {
      const run = saveManager.run!;
      const modeLabel =
        run.mode === 'ENDLESS' ? 'Endless Kingdom' : run.mode === 'DAILY' ? 'Daily Kingdom' : run.ascensionLevel > 0 ? `Ascension ${ROMAN[run.ascensionLevel]}` : 'Normal';
      entries.push({
        label: 'CONTINUE RUN',
        sublabel: `Floor ${run.floor} / ${run.mode === 'ENDLESS' ? '∞' : GameConfig.run.totalFloors} · ${modeLabel}`,
        variant: 'primary',
        onClick: () => this.continueRun(),
      });
    }

    entries.push({
      label: 'NEW EXPEDITION',
      sublabel: session.hasSavedRun() ? 'Abandons your current run' : undefined,
      variant: session.hasSavedRun() ? 'secondary' : 'primary',
      onClick: () => this.newRun('NORMAL'),
    });

    if (progression.hasFeature('ENDLESS')) {
      entries.push({
        label: 'ENDLESS KINGDOM',
        sublabel: profile.highestEndlessFloor > 0 ? `Best: Floor ${profile.highestEndlessFloor}` : 'The kingdom has no floor',
        onClick: () => this.newRun('ENDLESS'),
      });
    }

    if (progression.hasFeature('DAILY')) {
      const daily = createDailySeed();
      const done = profile.daily?.date === daily.date && profile.daily.completed;
      entries.push({
        label: 'DAILY KINGDOM',
        sublabel: done ? `Today's best: ${profile.daily?.bestScore ?? 0}` : `Seed ${daily.date}`,
        onClick: () => this.newRun('DAILY'),
      });
    }

    entries.push({
      label: 'HEROES',
      sublabel: `${profile.unlockedHeroes.length} / 20 recruited`,
      onClick: () => this.goto('Collection'),
    });
    entries.push({
      label: 'RECORDS & ACHIEVEMENTS',
      sublabel: `${profile.crownShards} Crown Shards`,
      onClick: () => this.goto('Records'),
    });
    entries.push({ label: 'SETTINGS', variant: 'ghost', onClick: () => this.openSettings() });

    const totalHeight = entries.length * (height + gap);
    const available = bottom - top;

    if (totalHeight <= available) {
      let y = top + (available - totalHeight) / 2 + height / 2;
      for (const entry of entries) {
        new Button(this, cx, y, {
          width,
          height,
          label: entry.label,
          ...(entry.sublabel ? { sublabel: entry.sublabel } : {}),
          variant: entry.variant ?? 'secondary',
          onClick: () => {
            audio.play('click');
            entry.onClick();
          },
        });
        y += height + gap;
      }
      return;
    }

    const scroller = new ScrollView(this, cx - width / 2, top, width, available);
    let y = height / 2;
    for (const entry of entries) {
      const button = new Button(this, width / 2, y, {
        width,
        height,
        label: entry.label,
        ...(entry.sublabel ? { sublabel: entry.sublabel } : {}),
        variant: entry.variant ?? 'secondary',
        onClick: () => {
          audio.play('click');
          entry.onClick();
        },
      });
      scroller.content.add(button);
      y += height + gap;
    }
    scroller.setContentHeight(y);
    scroller.refreshMask();
    this.scroller = scroller;
  }

  private buildFooter(): void {
    const profile = session.profile;
    const parts = [`Deepest Floor ${profile.highestFloor}`];
    if (profile.highestAscension > 0) parts.push(`Ascension ${ROMAN[profile.highestAscension]}`);
    if (profile.highestEndlessFloor > 0) parts.push(`Endless ${profile.highestEndlessFloor}`);
    this.label(this.W / 2, this.H - this.fs(24), parts.join('   ·   '), {
      size: 11,
      color: Theme.color.textFaint,
      font: 'body',
      origin: [0.5, 0.5],
      align: 'center',
    });
  }

  private continueRun(): void {
    const manager = session.resumeRun();
    if (!manager) {
      this.toast('That expedition is gone.', 'bad');
      this.scene.restart();
      return;
    }
    this.goto('Map');
  }

  private newRun(mode: GameMode): void {
    if (session.hasSavedRun()) {
      showModal(this, {
        title: 'Abandon the expedition?',
        body: 'Your current run will be lost. This cannot be undone.',
        accent: Theme.color.bad,
        dismissible: true,
        actions: [
          {
            label: 'ABANDON AND START OVER',
            variant: 'danger',
            onClick: () => {
              session.abandonRun();
              this.goto('HeroSelect', { mode });
            },
          },
          { label: 'KEEP PLAYING', variant: 'ghost', onClick: () => this.scene.restart() },
        ],
      });
      return;
    }
    this.goto('HeroSelect', { mode });
  }

  private openSettings(): void {
    const settings = session.profile.settings;
    const rebuild = () => {
      saveManager.requestSave();
      audio.applySettings(settings);
      this.scene.restart();
    };

    showModal(this, {
      title: 'Settings',
      notes: [
        `Music ${Math.round(settings.musicVolume * 100)}%   ·   Effects ${Math.round(settings.sfxVolume * 100)}%`,
      ],
      dismissible: true,
      actions: [
        {
          label: `Sound effects: ${settings.sfxVolume > 0 ? 'ON' : 'OFF'}`,
          onClick: () => {
            settings.sfxVolume = settings.sfxVolume > 0 ? 0 : 0.7;
            rebuild();
          },
        },
        {
          label: `Music: ${settings.musicVolume > 0 ? 'ON' : 'OFF'}`,
          onClick: () => {
            settings.musicVolume = settings.musicVolume > 0 ? 0 : 0.5;
            rebuild();
          },
        },
        {
          label: `Auto formation: ${settings.autoFormation ? 'ON' : 'OFF'}`,
          sublabel: 'Places new armies for you before a battle',
          onClick: () => {
            settings.autoFormation = !settings.autoFormation;
            rebuild();
          },
        },
        {
          label: `Damage numbers: ${settings.showDamageNumbers ? 'ON' : 'OFF'}`,
          onClick: () => {
            settings.showDamageNumbers = !settings.showDamageNumbers;
            rebuild();
          },
        },
        {
          label: `Reduced motion: ${settings.reduceMotion ? 'ON' : 'OFF'}`,
          sublabel: 'Fewer effects, steadier frame rate',
          onClick: () => {
            settings.reduceMotion = !settings.reduceMotion;
            rebuild();
          },
        },
        {
          label: 'RESET PROFILE',
          sublabel: 'Erases every unlock and record',
          variant: 'danger',
          onClick: () => this.confirmReset(),
        },
        { label: 'CLOSE', variant: 'ghost', onClick: () => this.scene.restart() },
      ],
    });
  }

  private confirmReset(): void {
    showModal(this, {
      title: 'Erase everything?',
      body: 'Every hero, achievement and record will be lost forever.',
      accent: Theme.color.bad,
      actions: [
        {
          label: 'YES, ERASE MY PROFILE',
          variant: 'danger',
          onClick: () => {
            saveManager.resetProfile();
            session.refreshProfile();
            session.runManager = null;
            this.scene.restart();
          },
        },
        { label: 'CANCEL', variant: 'ghost', onClick: () => this.scene.restart() },
      ],
    });
  }
}
