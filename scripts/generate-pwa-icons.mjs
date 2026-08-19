/**
 * Regenera íconos PWA desde public/brand/tokepass-mark.png
 * Fondo de marca: #09090b. Maskable: safe-zone 20% por lado.
 */
import { mkdir, copyFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "public", "brand", "tokepass-mark.png")
const ICONS = path.join(ROOT, "public", "icons")
const BG = { r: 9, g: 9, b: 11, alpha: 1 }

async function canvas(size, logoBuffer, insetRatio) {
  const inner = Math.max(1, Math.round(size * (1 - insetRatio * 2)))
  const offset = Math.round((size - inner) / 2)
  const logo = await sharp(logoBuffer)
    .resize(inner, inner, { fit: "contain", background: BG })
    .png()
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
}

async function write(size, dest, insetRatio) {
  await (await canvas(size, await sharp(SRC).png().toBuffer(), insetRatio)).toFile(
    dest,
  )
  console.log("wrote", path.relative(ROOT, dest), `${size}x${size}`)
}

async function writeMaskable(dest) {
  const trimmed = await sharp(SRC)
    .trim({ threshold: 16 })
    .png()
    .toBuffer()
  await (await canvas(512, trimmed, 0.2)).toFile(dest)
  console.log("wrote", path.relative(ROOT, dest), "512x512 maskable")
}

await mkdir(ICONS, { recursive: true })
await write(192, path.join(ICONS, "icon-192x192.png"), 0.08)
await write(512, path.join(ICONS, "icon-512x512.png"), 0.08)
await writeMaskable(path.join(ICONS, "icon-maskable-512x512.png"))
await write(180, path.join(ICONS, "apple-touch-icon.png"), 0.08)
await write(32, path.join(ROOT, "public", "favicon-32x32.png"), 0.06)
await write(16, path.join(ROOT, "public", "favicon-16x16.png"), 0.04)

await copyFile(
  path.join(ICONS, "icon-192x192.png"),
  path.join(ICONS, "icon-192.png"),
)
await copyFile(
  path.join(ICONS, "icon-512x512.png"),
  path.join(ICONS, "icon-512.png"),
)
await copyFile(
  path.join(ROOT, "public", "favicon-32x32.png"),
  path.join(ROOT, "public", "favicon.png"),
)

console.log("PWA icons ready")
