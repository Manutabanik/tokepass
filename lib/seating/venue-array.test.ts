import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampGridArraySize,
  distributeOnArc,
  generateGridArray,
  GRID_ARRAY_MAX_ITEMS,
} from "./venue-array"
import type { VenueMapElement } from "@/types/venue-map"

function chair(id: string, x: number, y: number): VenueMapElement {
  return {
    id,
    type: "vip_chair",
    label: id,
    category: "commercial",
    sectorName: "VIP",
    x,
    y,
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
    seats: [{ id: `${id}-S1`, number: 1, x, y, status: "available" }],
  }
}

describe("venue-array", () => {
  it("clamps a grid so it never exceeds the item cap", () => {
    const next = clampGridArraySize(100, 100)
    assert.equal(next.rows * next.columns <= GRID_ARRAY_MAX_ITEMS, true)
    assert.equal(next.rows >= 1, true)
    assert.equal(next.columns >= 1, true)
  })

  it("generates a selectable block with shared group and row index", () => {
    const elements = generateGridArray({
      type: "vip_chair",
      rows: 3,
      columns: 4,
      gap: 4,
      origin: { x: 100, y: 80 },
      groupName: "Platea",
    })
    assert.equal(elements.length, 12)
    const groupId = elements[0]?.groupId
    assert.ok(groupId)
    assert.equal(elements.every((item) => item.groupId === groupId), true)
    assert.equal(elements[0]?.x, 100)
    assert.equal(elements[0]?.y, 80)
    assert.equal(elements[0]?.ringIndex, 0)
    assert.equal(elements[4]?.ringIndex, 1)
    assert.equal(elements[1]!.x > elements[0]!.x, true)
    assert.equal(elements[4]!.y > elements[0]!.y, true)
    const ids = new Set(elements.map((item) => item.id))
    assert.equal(ids.size, 12)
  })

  it("distributes a row on an arc facing a top focal point", () => {
    const elements = [
      chair("a", 100, 200),
      chair("b", 200, 200),
      chair("c", 300, 200),
    ]
    const next = distributeOnArc(elements, ["a", "b", "c"], {
      sweepDeg: 90,
      focus: { x: 200, y: 20 },
    })
    const [left, mid, right] = ["a", "b", "c"].map(
      (id) => next.find((item) => item.id === id)!,
    )
    assert.equal(left.x < mid.x, true)
    assert.equal(right.x > mid.x, true)
    assert.equal(Math.abs(mid.rotation - 180) < 1, true)
    assert.equal(left.rotation > mid.rotation, true)
    assert.equal(right.rotation < mid.rotation, true)
    assert.equal(left.y < mid.y + 1, true)
    assert.equal(right.y < mid.y + 1, true)
  })

  it("leaves a single selection untouched", () => {
    const elements = [chair("only", 120, 140)]
    const next = distributeOnArc(elements, ["only"])
    assert.equal(next[0]?.x, 120)
    assert.equal(next[0]?.y, 140)
  })
})
