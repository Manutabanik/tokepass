import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detectRasterImageMagic, rasterContentType } from "./image-magic"

describe("image magic bytes", () => {
  it("accepts jpeg, png and webp signatures", () => {
    assert.equal(detectRasterImageMagic(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)), "jpeg")
    assert.equal(
      detectRasterImageMagic(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)),
      "png",
    )
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x41, 0x56, 0x45], 8)
    assert.equal(detectRasterImageMagic(webp), "webp")
    assert.equal(rasterContentType("jpeg"), "image/jpeg")
  })

  it("rejects files that only claim an image mime", () => {
    assert.equal(detectRasterImageMagic(Uint8Array.of(0x00, 0x00, 0x00, 0x00)), null)
    assert.equal(detectRasterImageMagic(new TextEncoder().encode("<svg></svg>")), null)
    const riffOnly = new Uint8Array(12)
    riffOnly.set([0x52, 0x49, 0x46, 0x46], 0)
    riffOnly.set([0x57, 0x41, 0x56, 0x45], 8)
    riffOnly[8] = 0x41
    assert.equal(detectRasterImageMagic(riffOnly), null)
  })
})
