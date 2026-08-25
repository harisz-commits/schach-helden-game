import Phaser from 'phaser';
import { Theme } from '../ui/theme';
import { GameConfig } from './GameConfig';
import { BootScene } from '../scenes/BootScene';
import { MainMenuScene } from '../scenes/MainMenuScene';
import { HeroSelectScene } from '../scenes/HeroSelectScene';
import { MapScene } from '../scenes/MapScene';
import { BattleScene } from '../scenes/BattleScene';
import { RewardScene } from '../scenes/RewardScene';
import { CollectionScene } from '../scenes/CollectionScene';
import { RunEndScene } from '../scenes/RunEndScene';
import { RecordsScene } from '../scenes/RecordsScene';

/** Creates the Phaser game. Sizing is fully responsive - no fixed canvas. */
export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: Theme.color.bg,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
      min: { width: GameConfig.ui.minWidth, height: 480 },
    },
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'low-power',
    },
    fps: { target: 60, forceSetTimeOut: false },
    input: { activePointers: 3 },
    scene: [
      BootScene,
      MainMenuScene,
      HeroSelectScene,
      MapScene,
      BattleScene,
      RewardScene,
      CollectionScene,
      RecordsScene,
      RunEndScene,
    ],
  });
}
