import { FiberState, type Disposable, type Effect, type Plugin } from './types.js';
import type { Context } from './context.js';

export class Fiber {
  public state: FiberState = FiberState.PENDING;
  public name: string;
  public inject: string[];
  public error?: Error;
  private _disposers: Disposable[] = [];
  private _children: Fiber[] = [];

  constructor(
    public ctx: Context,
    public plugin: Plugin,
    public config: any = {},
    public parent: Fiber | null = null
  ) {
    if (typeof plugin === 'function') {
      this.name = plugin.name || 'anonymous_plugin';
      this.inject = [];
    } else {
      this.name = plugin.name || 'plugin_object';
      this.inject = plugin.inject ? Array.from(plugin.inject) : [];
    }
  }

  collect(disposer: Disposable) {
    if (typeof disposer === 'function') {
      this._disposers.push(disposer);
    }
  }

  async start(): Promise<void> {
    if (this.state === FiberState.ACTIVE || this.state === FiberState.LOADING) {
      return;
    }

    // Check injection readiness
    for (const key of this.inject) {
      if ((this.ctx as any)[key] === undefined) {
        this.state = FiberState.PENDING;
        return;
      }
    }

    this.state = FiberState.LOADING;
    try {
      let effect: Effect | void = undefined;
      if (typeof this.plugin === 'function') {
        effect = await this.plugin(this.ctx, this.config);
      } else if (this.plugin.apply) {
        effect = await this.plugin.apply(this.ctx, this.config);
      }

      if (effect) {
        if (typeof effect === 'function') {
          this.collect(effect);
        } else if (Symbol.asyncIterator in Object(effect)) {
          for await (const d of effect as AsyncIterable<Disposable>) {
            this.collect(d);
          }
        } else if (Symbol.iterator in Object(effect)) {
          for (const d of effect as Iterable<Disposable>) {
            this.collect(d);
          }
        }
      }

      this.state = FiberState.ACTIVE;
    } catch (err: any) {
      this.state = FiberState.FAILED;
      this.error = err;
      console.error(`[Fiber Error] Plugin "${this.name}" failed to load:`, err);
      await this.dispose();
      throw err;
    }
  }

  async dispose(): Promise<void> {
    if (this.state === FiberState.DISPOSED || this.state === FiberState.UNLOADING) {
      return;
    }

    this.state = FiberState.UNLOADING;

    // First dispose child fibers
    for (const child of this._children.reverse()) {
      await child.dispose();
    }
    this._children = [];

    // LIFO unwind disposers
    while (this._disposers.length > 0) {
      const disposer = this._disposers.pop();
      if (disposer) {
        try {
          const res = disposer();
          if (res && typeof res.then === 'function') {
            await res;
          }
        } catch (err) {
          console.error(`[Fiber Teardown Error] Disposer in "${this.name}" threw:`, err);
        }
      }
    }

    this.state = FiberState.DISPOSED;
  }

  addChild(child: Fiber) {
    this._children.push(child);
  }
}
