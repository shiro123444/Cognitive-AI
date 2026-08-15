import type { ScopeKey, Disposable } from './types.js';
import type { Context } from './context.js';

export class ScopeRegistry {
  private _parentBindings = new Map<ScopeKey, ScopeKey>();

  bindScopeParent(childKey: ScopeKey, parentKey: ScopeKey): Disposable {
    if (this._parentBindings.has(childKey)) {
      throw new Error(`Scope [${String(childKey)}] already has a parent bound.`);
    }

    // Cycle check
    let curr: ScopeKey | undefined = parentKey;
    while (curr) {
      if (curr === childKey) {
        throw new Error(`Cycle detected when binding parent for Scope [${String(childKey)}]`);
      }
      curr = this._parentBindings.get(curr);
    }

    this._parentBindings.set(childKey, parentKey);
    return () => {
      this._parentBindings.delete(childKey);
    };
  }

  scopeParentOf(key: ScopeKey): ScopeKey | undefined {
    return this._parentBindings.get(key);
  }

  scopeChainOf(key: ScopeKey): ScopeKey[] {
    const chain: ScopeKey[] = [key];
    let curr = this._parentBindings.get(key);
    while (curr) {
      chain.push(curr);
      curr = this._parentBindings.get(curr);
    }
    return chain;
  }
}
