import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sanitizeSponsorSvg } from "./sanitize-svg"

describe("sanitizeSponsorSvg", () => {
  it("strips script tags and keeps the svg", () => {
    const cleaned = sanitizeSponsorSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>`,
    )
    assert.ok(cleaned)
    assert.equal(/<script/i.test(cleaned), false)
    assert.match(cleaned, /<rect/)
  })

  it("rejects non-svg payloads", () => {
    assert.equal(sanitizeSponsorSvg("not an image"), null)
    assert.equal(sanitizeSponsorSvg("<div>logo</div>"), null)
  })
})
