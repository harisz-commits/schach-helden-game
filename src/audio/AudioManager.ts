import Phaser from 'phaser';
import type { PlayerSettings } from '../core/types';

type Cue = 'click' | 'hit' | 'crit' | 'skill' | 'death' | 'victory' | 'defeat' | 'reward' | 'unlock';

/**
 * Audio is generated with WebAudio oscillators rather than shipped assets, so
 * the build stays tiny and there is nothing to load. Platform audio state
 * always wins: if the host mutes the game, nothing plays.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private platformEnabled = true;
  private settings: PlayerSettings | null = null;
  private paused = false;

  attach(scene: Phaser.Scene): void {
    // The context can only be created after a user gesture on most browsers.
    scene.input.once('pointerdown', () => this.ensureContext());
  }

  applySettings(settings: PlayerSettings): void {
    this.settings = settings;
    this.updateGain();
  }

  setPlatformAudioEnabled(enabled: boolean): void {
    this.platformEnabled = enabled;
    this.updateGain();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) void this.ctx?.suspend();
    else void this.ctx?.resume();
  }

  private ensureContext(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.updateGain();
    } catch {
      this.ctx = null;
    }
  }

  private updateGain(): void {
    if (!this.master || !this.ctx) return;
    const sfx = this.settings?.sfxVolume ?? 0.7;
    const value = this.platformEnabled && !this.paused ? sfx * 0.35 : 0;
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  play(cue: Cue): void {
    if (!this.platformEnabled || this.paused) return;
    this.ensureContext();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const tones: Record<Cue, { freq: number; type: OscillatorType; duration: number; sweep?: number }> = {
      click: { freq: 420, type: 'triangle', duration: 0.06 },
      hit: { freq: 180, type: 'square', duration: 0.05, sweep: -60 },
      crit: { freq: 320, type: 'sawtooth', duration: 0.11, sweep: -140 },
      skill: { freq: 540, type: 'triangle', duration: 0.16, sweep: 220 },
      death: { freq: 140, type: 'sawtooth', duration: 0.3, sweep: -90 },
      victory: { freq: 520, type: 'triangle', duration: 0.45, sweep: 260 },
      defeat: { freq: 220, type: 'sine', duration: 0.6, sweep: -120 },
      reward: { freq: 660, type: 'triangle', duration: 0.28, sweep: 180 },
      unlock: { freq: 480, type: 'triangle', duration: 0.5, sweep: 320 },
    };
    const tone = tones[cue];

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, now);
      if (tone.sweep) osc.frequency.linearRampToValueAtTime(Math.max(40, tone.freq + tone.sweep), now + tone.duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.6, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + tone.duration + 0.02);
    } catch {
      /* audio is a nice-to-have, never a failure mode */
    }
  }
}

export const audio = new AudioManager();
