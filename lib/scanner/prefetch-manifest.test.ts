import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clearPrefetchedManifest,
  peekPrefetchedManifest,
  prefetchDoorManifest,
} from "@/lib/scanner/prefetch-manifest"

describe("door manifest prefetch", () => {
  it("keeps the payload until the vault persists it", async () => {
    const payload = {
      eventId: "e1",
      eventTitle: "Norte",
      qrType: "dynamic" as const,
      hash: "h",
      tickets: [],
    }
    await prefetchDoorManifest("e1", async () => payload)
    assert.equal(peekPrefetchedManifest("e1")?.eventTitle, "Norte")
    clearPrefetchedManifest("e1")
    assert.equal(peekPrefetchedManifest("e1"), null)
  })
})
