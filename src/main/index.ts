import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu, nativeTheme, session, shell } from 'electron'
import { createHandlers, Services } from './handlers'
import { isTrustedUrl, registerIpc, sendEvent } from './ipc'
import { onOpLog } from './oplog'
import { isSafeExternalUrl } from './launch'

const here = fileURLToPath(new URL('.', import.meta.url))
const rendererFile = join(here, '../renderer/index.html')
const rendererUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
const preloadFile = join(here, '../preload/index.cjs')

// Allow tests to isolate user data.
if (process.env['SPOON_USER_DATA']) app.setPath('userData', process.env['SPOON_USER_DATA'])

app.setAppUserModelId('io.github.barkerbg001.spoon')
app.enableSandbox()

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Tailwind/Radix inject inline style attributes; no inline scripts are allowed.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  rendererUrl
    ? `connect-src 'self' ${new URL(rendererUrl).origin} ws://${new URL(rendererUrl).host}`
    : "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'Spoon',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16161a' : '#ffffff',
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(here, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged || process.env['SPOON_DEVTOOLS'] === '1'
    }
  })
  mainWindow = win
  win.once('ready-to-show', () => win.show())

  // Navigation is never allowed; links open in the system browser after validation.
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url, rendererUrl, rendererFile)) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())

  if (rendererUrl) void win.loadURL(rendererUrl)
  else void win.loadFile(rendererFile)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null
  )

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  })
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const services = new Services(app.getPath('userData'), (event, payload) =>
    sendEvent(event, payload)
  )
  await services.initGit()
  services.scheduleAutoFetch()
  registerIpc(createHandlers(services), (frame) =>
    isTrustedUrl(frame.url, rendererUrl, rendererFile)
  )
  onOpLog((entry) => sendEvent('oplog.updated', entry))
  nativeTheme.on('updated', () =>
    sendEvent('theme.system', { dark: nativeTheme.shouldUseDarkColors })
  )

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('before-quit', () => services.stopAll())
})

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (ev, url) => {
    if (!isTrustedUrl(url, rendererUrl, rendererFile)) ev.preventDefault()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export { mainWindow }
