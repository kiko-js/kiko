export type EventMap = Record<string, unknown>
export type Listener<T> = (payload: T) => void

export class Emitter<Events extends EventMap = EventMap> {
  // Store listeners under a uniform function type; event-specific payloads are
  // recovered at emit time through the known event key.
  private listeners = new Map<keyof Events, Set<Listener<unknown>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<unknown>)

    return () => this.off(event, listener)
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const wrapped: Listener<Events[K]> = payload => {
      this.off(event, wrapped as Listener<Events[K]>)
      listener(payload)
    }
    return this.on(event, wrapped)
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(listener as Listener<unknown>)
    if (set.size === 0) {
      this.listeners.delete(event)
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    // Snapshot: a listener may `off` itself or `on` another during emit.
    // Iterating the live Set would skip later listeners after an `off` and
    // may or may not visit `on`-added ones — both surprise callers. The
    // snapshot gives stable "listeners registered at emit time" semantics.
    for (const listener of [...set]) {
      ;(listener as Listener<Events[K]>)(payload)
    }
  }

  hasListeners<K extends keyof Events>(event?: K): boolean {
    if (event === undefined) {
      return this.listeners.size > 0
    }
    const set = this.listeners.get(event)
    return set !== undefined && set.size > 0
  }

  clear<K extends keyof Events>(event?: K): void {
    if (event === undefined) {
      this.listeners.clear()
    } else {
      this.listeners.delete(event)
    }
  }
}

export function createEmitter<Events extends EventMap = EventMap>(): Emitter<Events> {
  return new Emitter<Events>()
}
