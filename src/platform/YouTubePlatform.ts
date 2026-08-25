import { BasePlatform } from './GamePlatform';

/**
 * YouTube Playables adapter.
 *
 * The Playables SDK is loaded by index.html before the game bundle and exposes
 * a global `ytgame` object. Everything is defensive: if a call or an entire
 * namespace is missing (SDK version drift), the game keeps running and simply
 * loses that one integration rather than crashing.
 *
 * Before shipping, re-check the current official Playables requirements - this
 * file is intentionally the only place that needs to change.
 */
interface YTGameSDK {
  game?: {
    firstFrameReady?: () => void;
    gameReady?: () => void;
    loadData?: () => Promise<string>;
    saveData?: (data: string) => Promise<void>;
  };
  system?: {
    isAudioEnabled?: () => boolean;
    onAudioEnabledChange?: (callback: (enabled: boolean) => void) => void;
    onPause?: (callback: () => void) => void;
    onResume?: (callback: () => void) => void;
  };
  engagement?: {
    sendScore?: (payload: { value: number }) => Promise<void>;
  };
  IN_PLAYABLES_ENV?: boolean;
}

declare global {
  interface Window {
    ytgame?: YTGameSDK;
  }
}

/** Maximum bytes the Playables save API accepts. */
const MAX_SAVE_BYTES = 3 * 1024 * 1024;

export class YouTubePlatform extends BasePlatform {
  readonly name = 'youtube';

  private sdk: YTGameSDK | undefined;
  private lastSentScore = -1;

  static isAvailable(): boolean {
    return typeof window !== 'undefined' && window.ytgame?.IN_PLAYABLES_ENV === true;
  }

  async initialize(): Promise<void> {
    this.sdk = typeof window !== 'undefined' ? window.ytgame : undefined;
    const system = this.sdk?.system;
    try {
      this.audioEnabled = system?.isAudioEnabled?.() ?? true;
      system?.onAudioEnabledChange?.((enabled) => this.emitAudioChange(enabled));
      system?.onPause?.(() => this.emitPause());
      system?.onResume?.(() => this.emitResume());
    } catch (error) {
      console.warn('[YouTubePlatform] system hooks unavailable', error);
    }
  }

  override firstFrameReady(): void {
    try {
      this.sdk?.game?.firstFrameReady?.();
    } catch (error) {
      console.warn('[YouTubePlatform] firstFrameReady failed', error);
    }
  }

  override gameReady(): void {
    try {
      this.sdk?.game?.gameReady?.();
    } catch (error) {
      console.warn('[YouTubePlatform] gameReady failed', error);
    }
  }

  async saveData(data: string): Promise<void> {
    if (data.length > MAX_SAVE_BYTES) {
      console.warn('[YouTubePlatform] save payload too large, skipping');
      return;
    }
    try {
      await this.sdk?.game?.saveData?.(data);
    } catch (error) {
      console.warn('[YouTubePlatform] saveData failed', error);
    }
  }

  async loadData(): Promise<string | null> {
    try {
      const value = await this.sdk?.game?.loadData?.();
      return value ?? null;
    } catch (error) {
      console.warn('[YouTubePlatform] loadData failed', error);
      return null;
    }
  }

  override sendScore(score: number): void {
    // Only report genuine improvements.
    if (score <= this.lastSentScore) return;
    this.lastSentScore = score;
    try {
      void this.sdk?.engagement?.sendScore?.({ value: score });
    } catch (error) {
      console.warn('[YouTubePlatform] sendScore failed', error);
    }
  }
}
