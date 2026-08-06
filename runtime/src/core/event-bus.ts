type Listener<T> = (event: T) => void;

export class EventBus<T> {
  private listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: T) {
    for (const listener of this.listeners) listener(event);
  }

  /** @deprecated Use emit() */
  publish(event: T) {
    this.emit(event);
  }
}
