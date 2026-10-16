import { useSyncExternalStore } from 'react'

/** Tiny external store; components subscribe with useStore(store, selector). */
export class Store<T> {
  private listeners = new Set<() => void>()
  constructor(private state: T) {}
  get = (): T => this.state
  set = (patch: Partial<T> | ((s: T) => Partial<T>)): void => {
    const p = typeof patch === 'function' ? patch(this.state) : patch
    this.state = { ...this.state, ...p }
    for (const l of this.listeners) l()
  }
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}

export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}
