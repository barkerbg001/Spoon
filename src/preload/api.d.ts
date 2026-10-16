export interface SpoonBridge {
  invoke(method: string, args?: unknown): Promise<unknown>
  on(event: string, listener: (payload: unknown) => void): () => void
  platform: string
}

declare global {
  interface Window {
    spoon: SpoonBridge
  }
}
