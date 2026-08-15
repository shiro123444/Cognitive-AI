import type { Awaitable, Disposable, DispatchMode } from './types.js';

export type EventListener = (...args: any[]) => any;

export class EventsService {
  private _listeners = new Map<string, Set<EventListener>>();

  on(event: string, listener: EventListener, prepend = false): Disposable<void> {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }

    if (prepend) {
      const arr = Array.from(set);
      set.clear();
      set.add(listener);
      arr.forEach((l) => set!.add(l));
    } else {
      set.add(listener);
    }

    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this._listeners.delete(event);
      }
    };
  }

  emit(event: string, ...args: any[]): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of Array.from(set)) {
      try {
        listener(...args);
      } catch (err) {
        console.error(`[Event Error] emit "${event}":`, err);
      }
    }
  }

  async parallel(event: string, ...args: any[]): Promise<void> {
    const set = this._listeners.get(event);
    if (!set) return;
    const promises = Array.from(set).map(async (listener) => {
      try {
        await listener(...args);
      } catch (err) {
        console.error(`[Event Error] parallel "${event}":`, err);
      }
    });
    await Promise.all(promises);
  }

  async serial<T = any>(event: string, ...args: any[]): Promise<T | undefined> {
    const set = this._listeners.get(event);
    if (!set) return undefined;
    let result: any = undefined;
    for (const listener of Array.from(set)) {
      result = await listener(...args);
    }
    return result;
  }

  async waterfall<T = any>(event: string, initialValue: T, ...args: any[]): Promise<T> {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return initialValue;

    const listeners = Array.from(set);
    let index = 0;

    const next = async (currentVal: T): Promise<T> => {
      if (index >= listeners.length) return currentVal;
      const listener = listeners[index++];
      return await listener(currentVal, ...args, (nextVal?: T) => next(nextVal !== undefined ? nextVal : currentVal));
    };

    return await next(initialValue);
  }

  clear() {
    this._listeners.clear();
  }
}
