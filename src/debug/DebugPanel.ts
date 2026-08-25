import Phaser from 'phaser';
import { Theme } from '../ui/theme';
import { Button } from '../ui/components/Button';
import { closeTopModal, showModal } from '../ui/overlays/Modal';
import { session } from '../run/GameSession';
import { saveManager } from '../save/SaveManager';
import { BLESSINGS } from '../data/blessings';
import { RELICS } from '../data/relics';
import { HEROES } from '../data/heroes';
import { EVENTS } from '../data/events';

/**
 * Debug tooling is compiled out of production builds entirely.
 *
 * Written as the bare `import.meta.env.DEV` on purpose: Vite replaces that
 * exact expression with a literal at build time, so the whole debug module
 * tree-shakes away. Wrapping it in optional chaining defeats the replacement
 * and leaves the flag stuck at false in every build.
 */
export const DEBUG_ENABLED: boolean = import.meta.env.DEV;

/**
 * Development-only debug panel.
 *
 * Attached to the map screen as a small corner button. Never rendered in a
 * production build - the whole module tree-shakes away behind DEBUG_ENABLED.
 */
export function attachDebugPanel(scene: Phaser.Scene, onChanged: () => void): void {
  if (!DEBUG_ENABLED) return;
  const button = new Button(scene, 26, scene.scale.gameSize.height - 78, {
    width: 44,
    height: 24,
    label: 'DBG',
    variant: 'ghost',
    fontSize: 10,
    onClick: () => openPanel(scene, onChanged),
  });
  button.setDepth(9500).setAlpha(0.55);
}

function openPanel(scene: Phaser.Scene, onChanged: () => void): void {
  const manager = session.runManager;
  if (!manager) return;
  const run = manager.run;

  const act = (fn: () => void) => () => {
    fn();
    saveManager.requestSave();
    closeTopModal(scene);
    onChanged();
  };

  showModal(scene, {
    title: 'Debug',
    body: `Floor ${run.floor} · ${run.gold}g · seed ${run.seed}`,
    accent: Theme.color.rare,
    dismissible: true,
    maxWidth: 620,
    actions: [
      { label: 'Add 500 gold', onClick: act(() => manager.addGold(500)) },
      {
        label: 'Add random blessing',
        onClick: act(() => manager.addBlessing(BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)]!.id)),
      },
      {
        label: 'Add random relic',
        onClick: act(() => manager.addRelic(RELICS[Math.floor(Math.random() * RELICS.length)]!.id)),
      },
      { label: 'Reveal whole map', onClick: act(() => manager.fog.scoutAll()) },
      {
        label: 'Damage all armies 25%',
        onClick: act(() => {
          for (const army of manager.livingArmies) army.hpRatio = Math.max(0.01, army.hpRatio - 0.25);
        }),
      },
      {
        label: 'Kill first living army',
        onClick: act(() => {
          const army = manager.livingArmies[0];
          if (army) {
            army.hpRatio = 0;
            army.alive = false;
          }
        }),
      },
      {
        label: 'Heal everything',
        onClick: act(() =>
          manager.armies.forEach((a) => {
            a.hpRatio = 1;
            a.alive = true;
          }),
        ),
      },
      {
        label: 'More…',
        onClick: () => {
          closeTopModal(scene);
          openProgressionPanel(scene, onChanged);
        },
      },
      { label: 'CLOSE', variant: 'ghost', onClick: () => closeTopModal(scene) },
    ],
  });
}

function openProgressionPanel(scene: Phaser.Scene, onChanged: () => void): void {
  const manager = session.runManager;
  if (!manager) return;
  const act = (fn: () => void) => () => {
    fn();
    saveManager.requestSave();
    closeTopModal(scene);
    onChanged();
  };

  showModal(scene, {
    title: 'Debug — progression',
    accent: Theme.color.rare,
    dismissible: true,
    maxWidth: 620,
    actions: [
      {
        label: 'Win this floor and descend',
        onClick: act(() => {
          manager.run.currentMap!.guardianDefeated = true;
          manager.advanceFloor();
          session.onFloorReached();
        }),
      },
      {
        label: 'Jump to Floor 19',
        onClick: act(() => {
          manager.run.floor = 18;
          manager.advanceFloor();
          session.onFloorReached();
        }),
      },
      {
        label: 'Unlock all heroes',
        onClick: act(() => {
          session.profile.unlockedHeroes = HEROES.map((h) => h.id);
        }),
      },
      {
        label: 'Grant first victory',
        sublabel: 'Unlocks Ascension, Lieutenants, Endless, Daily',
        onClick: act(() => {
          session.profile.firstVictory = true;
          for (const feature of ['ASCENSION', 'LIEUTENANTS', 'ENDLESS', 'DAILY', 'EXTENDED_EVENTS']) {
            session.progression.unlockFeature(feature);
          }
        }),
      },
      {
        label: 'Add 500 Crown Shards',
        onClick: act(() => {
          session.profile.crownShards += 500;
        }),
      },
      {
        label: 'Turn a nearby tile into an event',
        onClick: act(() => {
          const tile = manager.fog.frontier()[0];
          if (tile) {
            tile.type = 'EVENT';
            tile.eventId = EVENTS[Math.floor(Math.random() * EVENTS.length)]!.id;
          }
        }),
      },
      {
        label: 'Reset profile',
        variant: 'danger',
        onClick: act(() => {
          saveManager.resetProfile();
          session.refreshProfile();
        }),
      },
      { label: 'CLOSE', variant: 'ghost', onClick: () => closeTopModal(scene) },
    ],
  });
}
