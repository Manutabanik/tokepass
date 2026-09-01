import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parsePlatformEventFilter } from "./platform-events-filter"

describe("platform events filter", () => {
  it("defaults to active events and accepts hidden queues", () => {
    assert.equal(parsePlatformEventFilter(undefined), "activos")
    assert.equal(parsePlatformEventFilter("solicitudes"), "solicitudes")
    assert.equal(parsePlatformEventFilter("eliminados"), "eliminados")
    assert.equal(parsePlatformEventFilter("deleted"), "activos")
  })
})
