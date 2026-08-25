import { BasePlatform } from './GamePlatform';

const STORAGE_KEY = 'crownbound.save.v1';

/**
 * Development / plain-web adapter. Persists to localStorage and derives
 * pause/resume from the page visibility API.
 */
export class LocalPlatform extends BasePlatform {
  readonly name = 'local';

  private memoryFallback: string | null = null;

  async initialize(): Promise<void> {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.emitPause();
        else this.emitResume();
      });
      window.addEventListener('blur', () => this.emitPause());
      window.addEventListener('focus', () => this.emitResume());
    }
  }

  async saveData(data: string): Promise<void> {
    this.memoryFallback = data;
    try {
      window.localStorage.setItem(STORAGE_KEY, data);
    } catch {
      // Private browsing or storage full - the in-memory copy keeps the
      // session going even if it will not survive a reload.
    }
  }

  async loadData(): Promise<string | null> {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (value !== null) return value;
    } catch {
      /* fall through to the memory copy */
    }
    return this.memoryFallback;
  }

  /** Local builds expose a manual audio toggle through settings. */
  setAudioEnabled(enabled: boolean): void {
    this.emitAudioChange(enabled);
  }
}
