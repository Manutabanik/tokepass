import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canPersistCatalogVenueName,
  isDraftPlaceholderVenueName,
  normalizeExactVenueName,
} from "./venue-identity"

describe("venue-identity", () => {
  it("trims and collapses whitespace for exact names", () => {
    assert.equal(normalizeExactVenueName("  Club   X  "), "Club X")
  })

  it("rejects the draft placeholder as a catalog name", () => {
    assert.equal(isDraftPlaceholderVenueName("Por definir"), true)
    assert.equal(isDraftPlaceholderVenueName(" por definir "), true)
    assert.equal(canPersistCatalogVenueName("Por definir"), false)
    assert.equal(canPersistCatalogVenueName("Estadio Central"), true)
  })
})
