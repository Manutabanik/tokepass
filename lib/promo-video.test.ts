import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isValidPromoVideoUrl, parsePromoVideoUrl } from "@/lib/promo-video"

describe("parsePromoVideoUrl", () => {
  it("parses YouTube watch URLs", () => {
    const parsed = parsePromoVideoUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
    assert.equal(parsed?.provider, "youtube")
    assert.equal(parsed?.id, "dQw4w9WgXcQ")
    assert.ok(parsed?.embedUrl.includes("youtube-nocookie.com"))
  })

  it("parses youtu.be short links", () => {
    const parsed = parsePromoVideoUrl("https://youtu.be/dQw4w9WgXcQ")
    assert.equal(parsed?.id, "dQw4w9WgXcQ")
  })

  it("parses Vimeo URLs", () => {
    const parsed = parsePromoVideoUrl("https://vimeo.com/123456789")
    assert.equal(parsed?.provider, "vimeo")
    assert.equal(parsed?.id, "123456789")
  })

  it("rejects non-video hosts", () => {
    assert.equal(parsePromoVideoUrl("https://example.com/video"), null)
    assert.equal(isValidPromoVideoUrl(""), true)
    assert.equal(isValidPromoVideoUrl("https://example.com"), false)
  })
})
