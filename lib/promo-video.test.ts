import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getEmbedUrl,
  getVideoType,
  hasGalleryEmbed,
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
    assert.ok(parsed.embedUrl?.includes("mute=1"))
    assert.ok(parsed.embedUrl?.includes("controls=1"))
    assert.ok(parsed.embedUrl?.includes("playsinline=1"))
  })

  it("builds a tap-to-play YouTube gallery embed without autoplay", () => {
    const parsed = getEmbedUrl("https://youtu.be/dQw4w9WgXcQ", { gallery: true })
    assert.equal(
      parsed.embedUrl,
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1",
    )
    assert.ok(!parsed.embedUrl?.includes("autoplay=1"))
  })

  it("classifies YouTube vs native MP4", () => {
    assert.equal(getVideoType("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube")
    assert.equal(getVideoType("https://youtu.be/dQw4w9WgXcQ"), "youtube")
    assert.equal(getVideoType("https://cdn.example.com/clips/spot.mp4"), "mp4")
    assert.equal(getVideoType("https://example.com/page"), null)
  })

  it("parses youtu.be and Shorts", () => {
    assert.equal(getEmbedUrl("https://youtu.be/dQw4w9WgXcQ").id, "dQw4w9WgXcQ")
    assert.equal(
      getEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").type,
      "youtube",
    )
  })

  it("builds a tap-to-play Vimeo gallery embed without autoplay", () => {
    const parsed = getEmbedUrl("https://vimeo.com/123456789", { gallery: true })
    assert.equal(parsed.embedUrl, "https://player.vimeo.com/video/123456789")
    assert.ok(!parsed.embedUrl?.includes("autoplay"))
  })

  it("only treats YouTube and Vimeo as gallery embeds", () => {
    assert.equal(hasGalleryEmbed("https://youtu.be/dQw4w9WgXcQ"), true)
    assert.equal(hasGalleryEmbed("https://vimeo.com/123456789"), true)
    assert.equal(hasGalleryEmbed("https://cdn.example.com/clips/spot.mp4"), false)
    assert.equal(hasGalleryEmbed(null), false)
  })

  it("parses Vimeo URLs", () => {
    const parsed = getEmbedUrl("https://vimeo.com/123456789")
    assert.equal(parsed.type, "vimeo")
    assert.equal(parsed.id, "123456789")
    assert.ok(parsed.embedUrl?.includes("player.vimeo.com"))
    assert.ok(parsed.embedUrl?.includes("autoplay=1"))
    assert.ok(parsed.embedUrl?.includes("muted=1"))
    assert.ok(parsed.embedUrl?.includes("controls=1"))
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
