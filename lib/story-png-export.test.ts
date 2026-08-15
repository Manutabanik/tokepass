import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STORY_EXPORT_MAX_BYTES,
  STORY_EXPORT_MIN_BYTES,
  STORY_EXPORT_PIXEL_RATIO,
  STORY_EXPORT_QUALITY,
  storyPngOptions,
} from "@/lib/story-png-export"

describe("story png ultra hd export", () => {
  it("renders at 3x with lossless png quality", () => {
    const options = storyPngOptions("#090014")
    assert.equal(STORY_EXPORT_PIXEL_RATIO, 3)
    assert.equal(STORY_EXPORT_QUALITY, 1)
    assert.equal(options.pixelRatio, 3)
    assert.equal(options.quality, 1)
    assert.equal(options.width, 1080)
    assert.equal(options.height, 1920)
    assert.equal(options.imagePlaceholder.startsWith("data:image/png"), true)
  })

  it("keeps the shareable weight window", () => {
    assert.equal(STORY_EXPORT_MIN_BYTES, Math.round(1.5 * 1024 * 1024))
    assert.equal(STORY_EXPORT_MAX_BYTES, Math.round(3.5 * 1024 * 1024))
  })
})
