import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Kept dependency-free: the sandboxed preload exposes exactly two capabilities —
// invoking a named, schema-validated operation and subscribing to known events.
// Validation happens in the main process.

const INVOKE_CHANNEL = 'spoon:invoke'
const EVENT_CHANNEL = 'spoon:event'
const EVENTS = new Set(['repo.changed', 'op.progress', 'oplog.updated', 'theme.system'])

const bridge = {
  invoke: (method: string, args?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(INVOKE_CHANNEL, method, args ?? {}),
  on: (event: string, listener: (payload: unknown) => void): (() => void) => {
    if (!EVENTS.has(event)) throw new Error(`Unknown event: ${event}`)
    const wrapped = (_e: IpcRendererEvent, name: string, payload: unknown): void => {
      if (name === event) listener(payload)
    }
    ipcRenderer.on(EVENT_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, wrapped)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('spoon', bridge)
