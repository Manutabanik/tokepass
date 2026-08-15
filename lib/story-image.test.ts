import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  parseStoryImageUrl,
  storyImageDataUrlEndpoint,
  storyImageSrc,
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

  it("allows public flyer hosts", () => {
    assert.equal(
      parseStoryImageUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")?.hostname,
      "i.ytimg.com",
    )
    assert.equal(
      parseStoryImageUrl("https://i.scdn.co/image/ab67616d0000b273")?.hostname,
      "i.scdn.co",
    )
  })

  it("builds a same-origin proxy url for public flyers", () => {
    const src = storyImageSrc("https://cdn.example/event.jpg")
    assert.equal(
      src,
      "/api/proxy-image?url=https%3A%2F%2Fcdn.example%2Fevent.jpg",
    )
    assert.equal(
      storyImageDataUrlEndpoint("https://cdn.example/event.jpg"),
      "/api/proxy-image?url=https%3A%2F%2Fcdn.example%2Fevent.jpg&format=dataurl",
    )
    assert.equal(storyImageSrc("data:image/png;base64,aaa"), "data:image/png;base64,aaa")
  })
})
