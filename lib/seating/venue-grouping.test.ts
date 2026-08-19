import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  expandElementSelection,
  groupVenueElements,
  selectionHasGroup,
  ungroupVenueElements,
} from "./venue-grouping"
import type { VenueMapElement } from "@/types/venue-map"

function chair(id: string, groupId?: string): VenueMapElement {
  return {
    id,
    type: "vip_chair",
    label: id,
    category: "commercial",
    sectorName: "VIP",
    x: 10,
    y: 10,
    width: 12,
    height: 12,
    rotation: 0,
    price: 0,
    color: "#f97316",
    opacity: 1,
    chairCount: 1,
    sideA: 1,
    sideB: 1,
    sellMode: "per_seat",
    priceMode: "per_person",
    capacity: 1,
    seats: [],
    groupId,
    groupName: groupId ? "Mesas VIP" : undefined,
  }
}

describe("venue-grouping", () => {
  it("wraps a multi-selection in a shared groupId", () => {
    const elements = [chair("a"), chair("b"), chair("c")]
    const next = groupVenueElements(elements, ["a", "c"], "Mesas VIP")
    assert.ok(next[0]?.groupId)
    assert.equal(next[0]?.groupId, next[2]?.groupId)
    assert.equal(next[1]?.groupId, undefined)
    assert.equal(next[0]?.groupName, "Mesas VIP")
    assert.equal(selectionHasGroup(next, ["a", "c"]), true)
  })

  it("selects every member of a group on click", () => {
    const elements = [
      chair("a", "vip"),
      chair("b", "vip"),
      chair("c", "otro"),
    ]
    assert.deepEqual(expandElementSelection(elements, "b", [], false), ["a", "b"])
  })

  it("toggles the whole group when shift-clicking", () => {
    const elements = [chair("a", "vip"), chair("b", "vip"), chair("c")]
    const added = expandElementSelection(elements, "a", ["c"], true)
    assert.deepEqual(added.sort(), ["a", "b", "c"])
    const removed = expandElementSelection(elements, "b", added, true)
    assert.deepEqual(removed, ["c"])
  })

  it("clears group metadata on ungroup without touching others", () => {
    const elements = [chair("a", "vip"), chair("b", "vip"), chair("c", "vip")]
    const next = ungroupVenueElements(elements, ["a", "b"])
    assert.equal(next[0]?.groupId, undefined)
    assert.equal(next[1]?.groupName, undefined)
    assert.equal(next[2]?.groupId, "vip")
  })
})
