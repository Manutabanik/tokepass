import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

type ExtractNextAssets = (html: unknown) => string[]

/**
 * El service worker no pasa por el bundler, así que no se puede importar. Se
 * evalúa el archivo real con un `self` mínimo para testear el código que se
 * despacha y no una copia que puede quedar desincronizada.
 */
function loadExtractNextAssets(): ExtractNextAssets {
  const source = readFileSync(
    new URL("../../public/sw.js", import.meta.url),
    "utf8",
  )
  const factory = new Function(
    "self",
    `${source}\nreturn extractNextAssets;`,
  ) as (swSelf: unknown) => ExtractNextAssets

  return factory({
    addEventListener: () => {},
    location: { origin: "https://tokepass.test" },
  })
}

const extractNextAssets = loadExtractNextAssets()

describe("service worker shell asset extraction", () => {
  it("picks up the hashed chunks, styles and fonts of a shell document", () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="/_next/static/css/9f2a1b.css"/>
      <link rel="preload" href="/_next/static/media/inter-4c1e.woff2" as="font"/>
      <script src="/_next/static/chunks/main-app-7d3f.js" async></script>
    </head><body></body></html>`

    assert.deepEqual(extractNextAssets(html).sort(), [
      "/_next/static/chunks/main-app-7d3f.js",
      "/_next/static/css/9f2a1b.css",
      "/_next/static/media/inter-4c1e.woff2",
    ])
  })

  it("dedupes the escaped copies that the flight payload repeats", () => {
    const html = `<script src="/_next/static/chunks/page-ab12.js"></script>
      <script>self.__next_f.push([1,"a:[\\"$\\",\\"script\\",null,{\\"src\\":\\"/_next/static/chunks/page-ab12.js\\"}]"])</script>`

    assert.deepEqual(extractNextAssets(html), [
      "/_next/static/chunks/page-ab12.js",
    ])
  })

  it("ignores assets that are not Next static output", () => {
    const html = `<script src="https://cdn.tercero.test/tag.js"></script>
      <script src="/sw.js"></script>
      <img src="/icons/icon-192x192.png"/>
      <link rel="manifest" href="/manifest.webmanifest"/>
      <a href="/api/ping">ping</a>`

    assert.deepEqual(extractNextAssets(html), [])
  })

  it("does not confuse a lookalike path from another origin prefix", () => {
    const html = `<script src="https://evil.test/_next/static/chunks/x.js"></script>`

    // El path se acepta acá, pero `precacheShellAssets` lo resuelve contra el
    // origen propio y `isNextStaticAsset` corta cualquier cosa cruzada.
    assert.deepEqual(extractNextAssets(html), [
      "/_next/static/chunks/x.js",
    ])
  })

  it("survives an empty or non-string body", () => {
    assert.deepEqual(extractNextAssets(""), [])
    assert.deepEqual(extractNextAssets(null), [])
    assert.deepEqual(extractNextAssets(undefined), [])
  })
})
