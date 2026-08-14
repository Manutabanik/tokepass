import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getEmbedUrl,
  isValidPromoVideoUrl,
  parsePromoVideoUrl,
} from "@/lib/promo-video"

describe("getEmbedUrl / parsePromoVideoUrl", () => {
  it("parses YouTube watch URLs with muted autoplay embed", () => {
    const parsed = getEmbedUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
    assert.equal(parsed.type, "youtube")
    assert.equal(parsed.id, "dQw4w9WgXcQ")
    assert.ok(parsed.embedUrl?.includes("youtube-nocookie.com/embed/"))
    assert.ok(parsed.embedUrl?.includes("autoplay=1"))
    assert.ok(parsed.embedUrl?.includes("mute=1") || parsed.embedUrl?.includes("muted=1"))
  })

  it("parses youtu.be and Shorts", () => {
    assert.equal(getEmbedUrl("https://youtu.be/dQw4w9WgXcQ").id, "dQw4w9WgXcQ")
    assert.equal(
      getEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").type,
      "youtube",
    )
  })

  it("parses Vimeo URLs", () => {
    const parsed = getEmbedUrl("https://vimeo.com/123456789")
    assert.equal(parsed.type, "vimeo")
    assert.equal(parsed.id, "123456789")
    assert.ok(parsed.embedUrl?.includes("player.vimeo.com"))
    assert.ok(parsed.embedUrl?.includes("muted=1"))
  })

  it("parses direct MP4 / WebM / Cloudinary video", () => {
    const mp4 = getEmbedUrl("https://cdn.example.com/clips/spot.mp4")
    assert.equal(mp4.type, "file")
    assert.equal(mp4.embedUrl, "https://cdn.example.com/clips/spot.mp4")

    const cloudinary = getEmbedUrl(
      "https://res.cloudinary.com/demo/video/upload/v1/sample.mp4",
    )
    assert.equal(cloudinary.type, "file")

    const supabase = getEmbedUrl(
      "https://xyz.supabase.co/storage/v1/object/public/media/spot.webm",
    )
    assert.equal(supabase.type, "file")
  })

  it("rejects non-video hosts", () => {
    assert.equal(parsePromoVideoUrl("https://example.com/video"), null)
    assert.equal(isValidPromoVideoUrl(""), true)
    assert.equal(isValidPromoVideoUrl("https://example.com"), false)
  })
})
