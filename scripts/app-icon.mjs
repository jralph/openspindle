/**
 * Renders the app icon's source, build/icon.svg, with Electron's Chromium:
 *
 *   npm run icon
 *
 * Writes build/icon.png (1024 px: electron-builder converts it for Windows and Linux, and dev
 * runs show it in the Dock) and build/icon.icns (the macOS icon; iconutil makes it, so only
 * on macOS). Every size is drawn from the SVG: NativeImage.resize garbles translucent edge
 * pixels.
 */
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { BrowserWindow, app } from "electron"

const root = fileURLToPath(new URL("..", import.meta.url))

/** Draws an SVG into an offscreen, transparent frame of `size` pixels; returns the PNG. */
async function render(svg, size) {
  const window = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    enableLargerThanScreen: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
  try {
    const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    const page = `<body style="margin:0"><img src="${image}" width="${size}" height="${size}" style="display:block">`
    await window.loadURL(
      `data:text/html;base64,${Buffer.from(page).toString("base64")}`
    )
    await window.webContents.executeJavaScript("document.images[0].decode()")
    // The first paint after an invalidation can carry an empty image.
    const frame = await new Promise((resolve) => {
      const paint = (_event, _dirty, image) => {
        if (image.isEmpty()) return
        window.webContents.off("paint", paint)
        resolve(image)
      }
      window.webContents.on("paint", paint)
      window.webContents.invalidate()
    })
    const { width, height } = frame.getSize()
    if (width !== size || height !== size)
      throw new Error(
        `Rendered ${width}×${height} pixels, not ${size}×${size}.`
      )
    return frame.toPNG()
  } finally {
    window.destroy()
  }
}

async function writeIcns(svg, file) {
  const folder = await mkdtemp(join(tmpdir(), "app-icon-"))
  const iconset = join(folder, "icon.iconset")
  try {
    await mkdir(iconset)
    for (const size of [16, 32, 128, 256, 512]) {
      await writeFile(
        join(iconset, `icon_${size}x${size}.png`),
        await render(svg, size)
      )
      await writeFile(
        join(iconset, `icon_${size}x${size}@2x.png`),
        await render(svg, size * 2)
      )
    }
    execFileSync("iconutil", ["--convert", "icns", "--output", file, iconset])
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

async function renderIcons() {
  const svg = await readFile(join(root, "build/icon.svg"), "utf8")
  await writeFile(join(root, "build/icon.png"), await render(svg, 1024))
  if (process.platform === "darwin")
    await writeIcns(svg, join(root, "build/icon.icns"))
  else console.warn("build/icon.icns needs macOS; it was left as it is.")
}

app.dock?.hide()
// Each render closes its window; without a listener the last close would quit the app.
app.on("window-all-closed", () => {})
// Not a top-level await: Electron is ready only once this module has finished evaluating.
app
  .whenReady()
  .then(renderIcons)
  .then(
    () => app.exit(0),
    (error) => {
      console.error(error)
      app.exit(1)
    }
  )
