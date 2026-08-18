import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { extractNextStaticUrls } from "@/lib/pwa/next-static-urls"

describe("extractNextStaticUrls", () => {
  it("keeps the full chunks path instead of stopping at the letter s", () => {
    const html = `
      <script src="/_next/static/chunks/194n8162zr6p_.js"></script>
      <link rel="stylesheet" href="/_next/static/chunks/app/layout.css"/>
    `
    assert.deepEqual(extractNextStaticUrls(html), [
      "/_next/static/chunks/194n8162zr6p_.js",
      "/_next/static/chunks/app/layout.css",
    ])
  })

  it("never emits the truncated /_next/static/chunk URL", () => {
    const html = `"/_next/static/chunks/turbopack-foo.js"`
    const urls = extractNextStaticUrls(html)
    assert.equal(urls.includes("/_next/static/chunk"), false)
    assert.equal(urls[0], "/_next/static/chunks/turbopack-foo.js")
  })
})
