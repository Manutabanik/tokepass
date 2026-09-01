import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"
import {
  pushVenueMapPast,
  shouldUndoPolygonDraft,
  takeVenueMapRedo,
  takeVenueMapUndo,
  VENUE_MAP_HISTORY_LIMIT,
} from "./venue-map-history"

describe("venue-map-history", () => {
  it("undoes to the previous snapshot and redo restores it", () => {
    const first = emptyVenueMap()
    first.stage = { ...first.stage!, label: "A" }
    const second = emptyVenueMap()
    second.stage = { ...second.stage!, label: "B" }
    const past = pushVenueMapPast([], first)
    const undone = takeVenueMapUndo(past, [], second)
    assert.ok(undone)
    assert.equal(undone.current.stage?.label, "A")
    assert.equal(undone.future.length, 1)
    const redone = takeVenueMapRedo(undone.past, undone.future, undone.current)
    assert.ok(redone)
    assert.equal(redone.current.stage?.label, "B")
    assert.equal(redone.past.length, 1)
    assert.equal(redone.future.length, 0)
  })

  it("deshace el último vértice del trazado activo en vez del mapa", () => {
    assert.equal(
      shouldUndoPolygonDraft({ tool: "polygon", draftLength: 3 }),
      true,
    )
    assert.equal(
      shouldUndoPolygonDraft({ tool: "select", draftLength: 3 }),
      false,
    )
    assert.equal(
      shouldUndoPolygonDraft({ tool: "polygon", draftLength: 0 }),
      false,
    )
  })

  it("caps the past stack", () => {
    let past = [] as ReturnType<typeof pushVenueMapPast>
    for (let index = 0; index < VENUE_MAP_HISTORY_LIMIT + 5; index += 1) {
      const map = emptyVenueMap()
      map.stage = { ...map.stage!, label: String(index) }
      past = pushVenueMapPast(past, map)
    }
    assert.equal(past.length, VENUE_MAP_HISTORY_LIMIT)
  })
})
