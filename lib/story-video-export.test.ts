import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  pickVideoMimeType,
  storyVideoPose,
  videoExtensionForMime,
} from "@/lib/story-video-export"

describe("story video export", () => {
  it("sweeps tilt left to right across the loop", () => {
    const start = storyVideoPose(0)
    const mid = storyVideoPose(0.25)
    const end = storyVideoPose(1)
    assert.equal(Math.abs(start.rotateY) < 0.2, true)
    assert.equal(mid.rotateY > 10, true)
    assert.equal(Math.abs(end.rotateY) < 0.2, true)
    assert.equal(storyVideoPose(0.125).pulse > 0.8, true)
  })

  it("prefers mp4 when the recorder supports it", () => {
    const mime = pickVideoMimeType((type) => type.startsWith("video/mp4"))
    assert.equal(mime?.startsWith("video/mp4"), true)
    assert.equal(videoExtensionForMime(mime ?? "video/webm"), "mp4")
  })

  it("falls back to webm", () => {
    const mime = pickVideoMimeType((type) => type.includes("webm"))
    assert.equal(mime?.includes("webm"), true)
    assert.equal(videoExtensionForMime(mime ?? ""), "webm")
  })
})
