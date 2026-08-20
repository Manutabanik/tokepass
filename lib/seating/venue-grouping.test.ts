import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  expandElementSelection,
  groupVenueElements,
  selectionHasGroup,
  selectionIsLogicalGroup,
  toggleElementsLocked,
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
    elements[0]!.x = 40
    elements[0]!.y = 80
    elements[0]!.label = "Fila 1 - Asiento 2"
    const next = ungroupVenueElements(elements, ["a", "b"])
    assert.equal(next[0]?.groupId, undefined)
    assert.equal(next[1]?.groupName, undefined)
    assert.equal(next[2]?.groupId, "vip")
    assert.equal(next[0]?.x, 40)
    assert.equal(next[0]?.y, 80)
    assert.equal(next[0]?.label, "Fila 1 - Asiento 2")
  })

  it("keeps a grouped click isolated to the target element", () => {
    const elements = [chair("a", "vip"), chair("b", "vip"), chair("c")]
    assert.deepEqual(
      expandElementSelection(elements, "b", [], false, { isolate: true }),
      ["b"],
    )
  })

  it("treats a shared groupId as one logical group", () => {
    const elements = [chair("a", "vip"), chair("b", "vip"), chair("c")]
    assert.equal(selectionIsLogicalGroup(elements, ["a", "b"]), true)
    assert.equal(selectionIsLogicalGroup(elements, ["a", "c"]), false)
  })

  it("toggles isLocked on the current selection only", () => {
    const elements = [chair("a"), chair("b"), chair("c")]
    const locked = toggleElementsLocked(elements, ["a", "c"])
    assert.equal(locked[0]?.isLocked, true)
    assert.equal(locked[1]?.isLocked, undefined)
    assert.equal(locked[2]?.isLocked, true)
    const unlocked = toggleElementsLocked(locked, ["a", "c"])
    assert.equal(unlocked[0]?.isLocked, undefined)
    assert.equal(unlocked[2]?.isLocked, undefined)
  })
})
