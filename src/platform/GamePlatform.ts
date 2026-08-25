/**
 * Platform abstraction.
 *
 * Nothing outside src/platform is allowed to touch a host SDK directly. When
 * the YouTube Playables SDK changes, YouTubePlatform.ts is the only file that
 * needs to change.
 */
export interface GamePlatform {
  readonly name: string;

  /** Called once before the game boots. */
  initialize(): Promise<void>;
  /** Signals that the first frame has been drawn. */
  firstFrameReady(): void;
  /** Signals that the game is fully loaded and interactive. */
  gameReady(): void;

  saveData(data: string): Promise<void>;
  loadData(): Promise<string | null>;

  isAudioEnabled(): boolean;
  onAudioChange(callback: (enabled: boolean) => void): void;

  onPause(callback: () => void): void;
  onResume(callback: () => void): void;

  sendScore(score: number): void;
}

export type PlatformName = 'local' | 'youtube';

/** Shared bookkeeping so each adapter only implements what is host specific. */
export abstract class BasePlatform implements GamePlatform {
  abstract readonly name: string;

  protected audioEnabled = true;
  protected audioCallbacks: ((enabled: boolean) => void)[] = [];
  protected pauseCallbacks: (() => void)[] = [];
  protected resumeCallbacks: (() => void)[] = [];

  abstract initialize(): Promise<void>;
  abstract saveData(data: string): Promise<void>;
  abstract loadData(): Promise<string | null>;

  firstFrameReady(): void {
    /* no-op by default */
  }

  gameReady(): void {
    /* no-op by default */
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  onAudioChange(callback: (enabled: boolean) => void): void {
    this.audioCallbacks.push(callback);
  }

  onPause(callback: () => void): void {
    this.pauseCallbacks.push(callback);
  }

  onResume(callback: () => void): void {
    this.resumeCallbacks.push(callback);
  }

  sendScore(_score: number): void {
    /* no-op by default */
  }

  protected emitAudioChange(enabled: boolean): void {
    this.audioEnabled = enabled;
    for (const callback of this.audioCallbacks) callback(enabled);
  }

  protected emitPause(): void {
    for (const callback of this.pauseCallbacks) callback();
  }

  protected emitResume(): void {
    for (const callback of this.resumeCallbacks) callback();
  }
}
