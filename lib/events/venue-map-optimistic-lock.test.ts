import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventTimestampsMatch,
  VENUE_MAP_STALE_WRITE_ERROR,
} from "./venue-map-optimistic-lock"

describe("venue-map-optimistic-lock", () => {
  it("acepta el mismo instante en ISO con distinta zona", () => {
    assert.equal(
      eventTimestampsMatch(
        "2026-09-01T15:00:00.000Z",
        "2026-09-01T15:00:00+00:00",
      ),
      true,
    )
  })

  it("rechaza timestamps distintos", () => {
    assert.equal(
      eventTimestampsMatch(
        "2026-09-01T15:00:00.000Z",
        "2026-09-01T15:00:01.000Z",
      ),
      false,
    )
    assert.equal(eventTimestampsMatch("2026-09-01T15:00:00.000Z", null), false)
  })

  it("expone el mensaje de recarga para no pisar cambios ajenos", () => {
    assert.equal(
      VENUE_MAP_STALE_WRITE_ERROR,
      "Alguien más ha modificado este mapa. Debes recargar la página para no sobrescribir sus cambios",
    )
  })
})
