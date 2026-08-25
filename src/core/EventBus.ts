type Handler<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub used to keep scenes decoupled from run logic.
 */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const handler of Array.from(set)) {
      (handler as Handler<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export interface GameEvents extends Record<string, unknown> {
  'run:started': { seed: number };
  'run:updated': Record<string, never>;
  'run:ended': { won: boolean };
  'profile:updated': Record<string, never>;
  'hero:unlocked': { heroId: string };
  'achievement:unlocked': { achievementId: string };
  'mastery:unlocked': { heroId: string; tier: number };
  'toast': { text: string; tone?: 'gold' | 'good' | 'bad' };
}

export const gameEvents = new EventBus<GameEvents>();
