import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STORY_EXPORT_MAX_BYTES,
  STORY_EXPORT_MIN_BYTES,
  STORY_EXPORT_PIXEL_RATIO,
  STORY_EXPORT_QUALITY,
  dataUrlToPngFile,
  storyPngOptions,
} from "@/lib/story-png-export"

describe("story png ultra hd export", () => {
  it("captures the 1080x1920 mold at 1x with CORS unlocked", () => {
    const options = storyPngOptions("#090014")
    assert.equal(STORY_EXPORT_PIXEL_RATIO, 1)
    assert.equal(STORY_EXPORT_QUALITY, 1)
    assert.equal(options.pixelRatio, 1)
    assert.equal(options.useCORS, true)
    assert.equal(options.allowTaint, true)
    assert.equal(options.quality, 1)
    assert.equal(options.width, 1080)
    assert.equal(options.height, 1920)
    assert.equal(options.imagePlaceholder.startsWith("data:image/png"), true)
  })

  it("keeps the shareable weight window", () => {
    assert.equal(STORY_EXPORT_MIN_BYTES, Math.round(1.5 * 1024 * 1024))
    assert.equal(STORY_EXPORT_MAX_BYTES, Math.round(3.5 * 1024 * 1024))
  })

  it("turns a png data URL into a File", () => {
    const file = dataUrlToPngFile(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "historia.png",
    )
    assert.equal(file.name, "historia.png")
    assert.equal(file.type, "image/png")
    assert.equal(file.size > 0, true)
  })
})
