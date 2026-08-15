export type Awaitable<T> = T | PromiseLike<T>;

export type Disposable<T = any> = () => T;

export type Effect<T = any> =
  | Disposable<T>
  | Iterable<Disposable<T>, void, void>
  | Promise<Disposable<T>>
  | AsyncIterable<Disposable<T>, void, void>;

export const enum FiberState {
  PENDING = 0,
  LOADING = 1,
  ACTIVE = 2,
  FAILED = 3,
  UNLOADING = 4,
  DISPOSED = 5,
}

export type DispatchMode = 'emit' | 'waterfall' | 'parallel' | 'serial';

export interface PluginObject<C = any> {
  name?: string;
  inject?: string[] | readonly string[];
  apply?: (ctx: C, config?: any) => Effect | void | Promise<Effect | void>;
  Config?: any;
}

export type PluginFunction<C = any> = (ctx: C, config?: any) => Effect | void | Promise<Effect | void>;

export type Plugin<C = any> = PluginObject<C> | PluginFunction<C>;

export type ScopeKey = symbol | string;
