import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getMetadataBaseUrl,
  getSeoOrigin,
  publicProducerPath,
  publicProducerUrl,
} from "./site"

describe("seo origin", () => {
  it("returns a valid origin URL", () => {
    const origin = getSeoOrigin()
    assert.equal(origin.startsWith("http"), true)
    const url = getMetadataBaseUrl()
    assert.equal(url.origin, origin)
  })
})

describe("public producer path", () => {
  it("builds the canonical producer profile URL", () => {
    const id = "11111111-1111-4111-8111-111111111111"
    assert.equal(publicProducerPath(id), `/producer/${id}`)
    assert.equal(publicProducerUrl(id).endsWith(`/producer/${id}`), true)
  })
})
