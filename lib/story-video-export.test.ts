import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getSupportedMimeType,
  isH264MimeType,
  isMp4Container,
  isWebmContainer,
  MAX_STORY_VIDEO_BYTES,
} from "@/lib/story-video-export"

describe("story h264 mime selection", () => {
  it("picks the first supported avc1 mp4 profile", () => {
    const mime = getSupportedMimeType((type) =>
      type.startsWith("video/mp4;codecs=avc1"),
    )
    assert.equal(mime, "video/mp4;codecs=avc1.42E01E,mp4a.40.2")
  })

  it("never selects vp8 vp9 or av1", () => {
    const mime = getSupportedMimeType((type) =>
      ["video/webm;codecs=vp9", "video/webm", "video/webm;codecs=av01"].includes(
        type,
      ),
    )
    assert.equal(mime, null)
  })

  it("accepts only h264 family mime types", () => {
    assert.equal(isH264MimeType("video/mp4;codecs=avc1.42E01E"), true)
    assert.equal(isH264MimeType("video/mp4"), true)
    assert.equal(isH264MimeType("video/webm;codecs=h264"), true)
    assert.equal(isH264MimeType("video/webm;codecs=vp9"), false)
    assert.equal(isH264MimeType("video/webm;codecs=vp8"), false)
    assert.equal(isH264MimeType("video/mp4;codecs=av01"), false)
  })
})

describe("whatsapp mp4 container sniff", () => {
  it("detects ftyp boxes and rejects webm ebml", () => {
    const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])
    assert.equal(isMp4Container(mp4), true)
    assert.equal(isWebmContainer(webm), true)
    assert.equal(isMp4Container(webm), false)
  })

  it("keeps the whatsapp mobile size cap at 3mb", () => {
    assert.equal(MAX_STORY_VIDEO_BYTES, 3 * 1024 * 1024)
  })
})
