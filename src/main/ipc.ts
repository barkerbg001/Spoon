import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebFrameMain } from 'electron'
import { api, type ApiEvent, type ApiEvents, type ApiMethod, type ApiResponse } from '@shared/api'
import { AppError, toErrorPayload } from './errors'
import { requireRepo } from './git/repo'
import { withRepoLock } from './git/lock'
import { MUTATING, UNDOABLE, type CallContext, type Handlers } from './handlers'
import { recordUndo } from './git/undo'

export const INVOKE_CHANNEL = 'spoon:invoke'
export const EVENT_CHANNEL = 'spoon:event'

function sameRealFile(a: string, b: string): boolean {
  try {
    const ra = realpathSync.native(a)
    const rb = realpathSync.native(b)
    return process.platform === 'win32' || process.platform === 'darwin'
      ? ra.toLowerCase() === rb.toLowerCase()
      : ra === rb
  } catch {
    return false
  }
}

/** The renderer is either the dev server (development) or the bundled file (production). */
export function isTrustedUrl(
  url: string,
  rendererUrl: string | undefined,
  rendererFile: string
): boolean {
  try {
    const u = new URL(url)
    if (rendererUrl) {
      const dev = new URL(rendererUrl)
      if (u.origin === dev.origin) return true
    }
    if (u.protocol === 'file:') {
      const want = new URL(`file:///${rendererFile.replace(/\\/g, '/').replace(/^\/+/, '')}`)
      if (
        decodeURIComponent(u.pathname).toLowerCase() ===
        decodeURIComponent(want.pathname).toLowerCase()
      )
        return true
      // The same file can be spelled differently: a Windows 8.3 short name (C:\Users\ABC~1\...)
      // or a symlinked folder. Compare the real paths of both; a different file never matches.
      return sameRealFile(fileURLToPath(u), rendererFile)
    }
    return false
  } catch {
    return false
  }
}

export function registerIpc(handlers: Handlers, trusted: (frame: WebFrameMain) => boolean): void {
  ipcMain.handle(
    INVOKE_CHANNEL,
    async (
      event: IpcMainInvokeEvent,
      method: unknown,
      rawArgs: unknown
    ): Promise<ApiResponse<unknown>> => {
      try {
        const frame = event.senderFrame
        if (!frame || frame !== event.sender.mainFrame || !trusted(frame)) {
          throw new AppError('VALIDATION', 'Request from an untrusted frame was rejected.')
        }
        if (typeof method !== 'string' || !Object.prototype.hasOwnProperty.call(api, method)) {
          throw new AppError('VALIDATION', 'Unknown operation.')
        }
        const m = method as ApiMethod
        const parsed = api[m].args.safeParse(rawArgs ?? {})
        if (!parsed.success) {
          throw new AppError(
            'VALIDATION',
            'Invalid request: ' +
              parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          )
        }
        const args = parsed.data as Record<string, unknown>
        const call: CallContext = {
          window: BrowserWindow.fromWebContents(event.sender),
          progress: (p) => {
            if (!event.sender.isDestroyed()) event.sender.send(EVENT_CHANNEL, 'op.progress', p)
          }
        }
        const handler = handlers[m] as (a: unknown, c: CallContext) => unknown
        const undoable = UNDOABLE[m]
        const run = async (): Promise<unknown> => {
          if (!undoable || typeof args['repo'] !== 'string') return handler(args, call)
          const { label, mode } = undoable(args)
          return recordUndo(requireRepo(args['repo']), label, mode, async () => handler(args, call))
        }
        const value =
          MUTATING.has(m) && typeof args['repo'] === 'string'
            ? await withRepoLock(requireRepo(args['repo']).commonDir, run)
            : await run()
        return { ok: true, value }
      } catch (err) {
        return { ok: false, error: toErrorPayload(err) }
      }
    }
  )
}

export function sendEvent<E extends ApiEvent>(event: E, payload: ApiEvents[E]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.webContents.isDestroyed()) w.webContents.send(EVENT_CHANNEL, event, payload)
  }
}
