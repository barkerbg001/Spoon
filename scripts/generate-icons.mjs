// Rasterises build/icon.svg into the platform icons used by electron-builder:
//   build/icon.png (1024), build/icons/<size>x<size>.png (Linux), build/icon.ico (Windows), build/icon.icns (macOS).
// Runs inside Electron (Chromium renders the SVG), so no native image libraries are needed:
//   npm run icons   (=> electron scripts/generate-icons.mjs)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const build = join(root, 'build')
const svg = readFileSync(join(build, 'icon.svg'), 'utf8')
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

async function render(win, size) {
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))}
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = ${size}
    const g = c.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, ${size}, ${size})
    return c.toDataURL('image/png')
  })()`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** ICO with embedded PNG images (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, png }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...images.map((i) => i.png)])
}

/** ICNS with PNG payloads (ic07..ic10 = 128..1024 px). */
function icns(images) {
  const chunks = images.map(({ type, png }) => {
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii')
    h.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([h, png])
  })
  const body = Buffer.concat(chunks)
  const h = Buffer.alloc(8)
  h.write('icns', 0, 'ascii')
  h.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([h, body])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const pngs = {}
  for (const s of SIZES) pngs[s] = await render(win, s)

  mkdirSync(join(build, 'icons'), { recursive: true })
  for (const s of [16, 32, 48, 64, 128, 256, 512, 1024])
    writeFileSync(join(build, 'icons', `${s}x${s}.png`), pngs[s])
  writeFileSync(join(build, 'icon.png'), pngs[1024])
  writeFileSync(
    join(build, 'icon.ico'),
    ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngs[size] })))
  )
  writeFileSync(
    join(build, 'icon.icns'),
    icns([
      { type: 'ic07', png: pngs[128] },
      { type: 'ic08', png: pngs[256] },
      { type: 'ic09', png: pngs[512] },
      { type: 'ic10', png: pngs[1024] }
    ])
  )
  console.log('Icons written to build/')
  app.quit()
})
