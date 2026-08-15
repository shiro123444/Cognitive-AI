import { EventsService } from './events.js';
import { Fiber } from './fiber.js';
import { ScopeRegistry } from './scope.js';
import type { Disposable, Effect, Plugin, ScopeKey } from './types.js';

export const kScope = Symbol.for('cordis.scope');
export const kIsolate = Symbol.for('cordis.isolate');

export class Context {
  public root: Context;
  public events: EventsService;
  public scopes: ScopeRegistry;
  public fiber!: Fiber;
  public [kScope]?: ScopeKey;
  public [kIsolate]: Record<string, symbol> = Object.create(null);

  private _fibers: Fiber[] = [];
  private _services = new Map<string, any>();

  constructor(parent?: Context) {
    if (!parent) {
      this.root = this;
      this.events = new EventsService();
      this.scopes = new ScopeRegistry();
      this.fiber = new Fiber(this, () => {});
    } else {
      this.root = parent.root;
      this.events = parent.events;
      this.scopes = parent.scopes;
      this[kScope] = parent[kScope];
      this[kIsolate] = Object.create(parent[kIsolate]);
    }
  }

  extend(meta: Partial<Context> = {}): this {
    const child = Object.create(this) as this;
    Object.assign(child, meta);
    return child;
  }

  isolate(name: string, label?: symbol): this {
    const shadow = Object.create(this[kIsolate]);
    shadow[name] = label ?? Symbol(name);
    return this.extend({ [kIsolate]: shadow });
  }

  withScope(key: ScopeKey): this {
    return this.extend({ [kScope]: key });
  }

  provide<T = any>(name: string, service: T): Disposable {
    (this as any)[name] = service;
    this._services.set(name, service);
    this.events.emit(`service/${name}`, service);

    // Awaken pending fibers
    this._checkPendingFibers();

    return () => {
      delete (this as any)[name];
      this._services.delete(name);
      this.events.emit(`service/${name}:disposed`, service);
    };
  }

  effect(fn: () => Effect | void): Disposable {
    const fiber = this.fiber;
    let cleanup: any;
    try {
      const res = fn();
      if (typeof res === 'function') {
        cleanup = res;
        fiber.collect(res);
      }
    } catch (e) {
      console.error('[Effect Execution Error]:', e);
    }
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }

  on(event: string, listener: (...args: any[]) => any, prepend = false): Disposable {
    const disposer = this.events.on(event, listener, prepend);
    this.fiber.collect(disposer);
    return disposer;
  }

  emit(event: string, ...args: any[]): void {
    this.events.emit(event, ...args);
  }

  async waterfall<T = any>(event: string, initial: T, ...args: any[]): Promise<T> {
    return await this.events.waterfall<T>(event, initial, ...args);
  }

  async serial<T = any>(event: string, ...args: any[]): Promise<T | undefined> {
    return await this.events.serial<T>(event, ...args);
  }

  async parallel(event: string, ...args: any[]): Promise<void> {
    await this.events.parallel(event, ...args);
  }

  async plugin<C = any>(plugin: Plugin<Context>, config?: C): Promise<Fiber> {
    const fiber = new Fiber(this, plugin, config, this.fiber);
    this.fiber.addChild(fiber);
    this._fibers.push(fiber);

    await fiber.start();
    return fiber;
  }

  private async _checkPendingFibers() {
    for (const fiber of this._fibers) {
      if (fiber.state === 0 /* PENDING */) {
        await fiber.start();
      }
    }
  }

  async dispose(): Promise<void> {
    await this.fiber.dispose();
  }
}
