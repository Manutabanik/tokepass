import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  fetchImageAsBase64,
  parseStoryImageUrl,
  storyImageDataUrlEndpoint,
  storyImageSrc,
  storySafeImageSrc,
} from "@/lib/story-image"

describe("story image proxy helpers", () => {
  it("rejects private and credentialed urls", () => {
    assert.equal(parseStoryImageUrl("http://127.0.0.1/secret.png"), null)
    assert.equal(parseStoryImageUrl("http://192.168.0.10/flyer.jpg"), null)
    assert.equal(
      parseStoryImageUrl("https://user:pass@cdn.example/a.jpg"),
      null,
    )
    assert.equal(parseStoryImageUrl("javascript:alert(1)"), null)
  })

  it("allows supabase, authorized cdns and the official site", () => {
    assert.equal(
      parseStoryImageUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")?.hostname,
      "i.ytimg.com",
    )
    assert.equal(
      parseStoryImageUrl("https://i.scdn.co/image/ab67616d0000b273")?.hostname,
      "i.scdn.co",
    )
    assert.equal(
      parseStoryImageUrl(
        "https://xyzcompany.supabase.co/storage/v1/object/public/event-flyers/a.jpg",
      )?.hostname,
      "xyzcompany.supabase.co",
    )
    assert.equal(
      parseStoryImageUrl("https://www.tokepass.com.ar/brand/mark.png")?.hostname,
      "www.tokepass.com.ar",
    )
  })

  it("rejects hosts outside the allowlist", () => {
    assert.equal(parseStoryImageUrl("https://cdn.example/event.jpg"), null)
    assert.equal(parseStoryImageUrl("https://evil.example/a.jpg"), null)
    assert.equal(storyImageSrc("https://cdn.example/event.jpg"), null)
  })

  it("builds a same-origin proxy url for public flyers", () => {
    const src = storyImageSrc("https://i.scdn.co/image/ab67616d0000b273")
    assert.equal(
      src,
      "/api/proxy-image?url=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b273",
    )
    assert.equal(
      storyImageDataUrlEndpoint("https://i.scdn.co/image/ab67616d0000b273"),
      "/api/proxy-image?url=https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b273&format=dataurl",
    )
    assert.equal(storyImageSrc("data:image/png;base64,aaa"), "data:image/png;base64,aaa")
  })

  it("accepts only untainted sources for the story canvas", () => {
    assert.equal(
      storySafeImageSrc("data:image/png;base64,aaa"),
      "data:image/png;base64,aaa",
    )
    assert.equal(
      storySafeImageSrc("/api/proxy-image?url=https%3A%2F%2Fcdn.example%2Fa.jpg"),
      "/api/proxy-image?url=https%3A%2F%2Fcdn.example%2Fa.jpg",
    )
    assert.equal(storySafeImageSrc("https://cdn.example/event.jpg"), null)
    assert.equal(storySafeImageSrc("//cdn.example/event.jpg"), null)
  })

  it("returns an existing data URL from fetchImageAsBase64", async () => {
    const dataUrl = "data:image/png;base64,aaa"
    assert.equal(await fetchImageAsBase64(dataUrl), dataUrl)
    assert.equal(await fetchImageAsBase64("  "), null)
  })
})
