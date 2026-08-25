import Phaser from 'phaser';
import { BaseScene } from '../ui/BaseScene';
import { Theme, toCss } from '../ui/theme';
import { ensureSparkTexture, ensureUnitTexture } from '../ui/Sprites';
import { HEROES } from '../data/heroes';
import { ENEMIES } from '../data/enemies';
import { BOSSES } from '../data/bosses';
import { saveManager } from '../save/SaveManager';
import { platform } from '../platform';
import { audio } from '../audio/AudioManager';

/**
 * Boots the game: initialises the platform adapter, loads the save, and bakes
 * every procedural unit texture so no scene stalls generating art mid-run.
 */
export class BootScene extends BaseScene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.paintBackground(Theme.color.bg);

    const title = this.add
      .text(this.W / 2, this.H / 2 - this.fs(20), 'CROWNBOUND', {
        fontFamily: Theme.font.display,
        fontSize: `${this.fs(38)}px`,
        color: toCss(Theme.color.gold),
      })
      .setOrigin(0.5)
      .setLetterSpacing(10);

    const status = this.add
      .text(this.W / 2, this.H / 2 + this.fs(30), 'PREPARING THE EXPEDITION', {
        fontFamily: Theme.font.body,
        fontSize: `${this.fs(12)}px`,
        color: toCss(Theme.color.textFaint),
      })
      .setOrigin(0.5)
      .setLetterSpacing(4);

    this.tweens.add({ targets: title, alpha: { from: 0.4, to: 1 }, duration: 700, yoyo: true, repeat: -1 });

    void this.boot(status);
  }

  private async boot(status: Phaser.GameObjects.Text): Promise<void> {
    this.bakeTextures();
    platform().firstFrameReady();

    try {
      await platform().initialize();
      await saveManager.load();
    } catch (error) {
      console.warn('[Boot] initialisation problem', error);
    }

    audio.attach(this);
    audio.applySettings(saveManager.profile.settings);

    platform().onPause(() => {
      this.game.events.emit('platform:pause');
      void saveManager.flush();
    });
    platform().onResume(() => this.game.events.emit('platform:resume'));
    platform().onAudioChange((enabled) => audio.setPlatformAudioEnabled(enabled));
    audio.setPlatformAudioEnabled(platform().isAudioEnabled());

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void saveManager.flush();
      });
      window.addEventListener('pagehide', () => void saveManager.flush());
    }

    status.setText('READY');
    platform().gameReady();
    const splash = typeof document !== 'undefined' ? document.getElementById('boot-splash') : null;
    splash?.classList.add('hidden');

    this.time.delayedCall(120, () => this.scene.start('MainMenu'));
  }

  /** Pre-generates every unit silhouette so battles never hitch. */
  private bakeTextures(): void {
    ensureSparkTexture(this);
    for (const hero of HEROES) ensureUnitTexture(this, hero.art.shape, hero.art.color, hero.art.accent);
    for (const enemy of ENEMIES) ensureUnitTexture(this, enemy.art.shape, enemy.art.color, enemy.art.accent);
    for (const boss of BOSSES) {
      ensureUnitTexture(this, boss.enemy.art.shape, boss.enemy.art.color, boss.enemy.art.accent);
    }
  }
}
