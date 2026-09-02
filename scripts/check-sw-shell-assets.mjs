/**
 * Valida que la extracción de assets del service worker encuentre los chunks
 * que Next realmente emite. Los fixtures del test unitario son sintéticos: si
 * Next cambia la forma del HTML, solo un documento real lo detecta.
 *
 * Uso: node scripts/check-sw-shell-assets.mjs [origin]
 * Requiere el server levantado (`next start`).
 */
import { readFileSync } from "node:fs"

const origin = process.argv[2] ?? "http://localhost:3000"
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")
const extractNextAssets = new Function(
  "self",
  `${source}\nreturn extractNextAssets;`,
)({ addEventListener: () => {}, location: { origin } })

// Las rutas que el SW promete servir sin conexión.
const SHELLS = ["/offline/billetera", "/puerta", "/puerta/escanear"]

let failed = false

for (const shell of SHELLS) {
  const response = await fetch(`${origin}${shell}`, { redirect: "manual" })
  const html = await response.text()
  const assets = extractNextAssets(html)
  const scripts = (html.match(/<script[^>]+src=/g) ?? []).length

  console.log(
    `${shell} → HTTP ${response.status}, ${scripts} <script src>, ${assets.length} assets extraídos`,
  )
  for (const asset of assets) console.log(`    ${asset}`)

  if (response.status >= 200 && response.status < 300 && assets.length === 0) {
    console.error(`  ✗ ${shell} no expuso ningún asset de /_next/static`)
    failed = true
  }

  for (const asset of assets) {
    const head = await fetch(`${origin}${asset}`, { method: "HEAD" })
    if (!head.ok) {
      console.error(`  ✗ ${asset} devolvió HTTP ${head.status}`)
      failed = true
    }
  }
}

if (failed) {
  console.error("\nLa extracción no coincide con el HTML que emite Next.")
  process.exit(1)
}

console.log("\nOK: cada shell expone assets de /_next/static y todos resuelven.")
