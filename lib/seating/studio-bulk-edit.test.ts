import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applySequentialLabels } from "@/lib/seating/auto-numbering"
import {
  applyBulkElementCapacity,
  applyBulkElementColor,
  applyBulkElementPrice,
  selectSimilarElementIds,
} from "@/lib/seating/studio-bulk-edit"
import type { VenueMapElement } from "@/types/venue-map"

function table(
  id: string,
  color: string,
  extras: Partial<VenueMapElement> = {},
): VenueMapElement {
  return {
    id,
    type: "round_table",
    label: id,
    category: "commercial",
    sectorName: "Mesas",
    x: 10,
    y: 10,
    width: 28,
    height: 28,
    rotation: 0,
    price: 1000,
    color,
    opacity: 1,
    chairCount: 6,
    sideA: 0,
    sideB: 0,
    sellMode: "group",
    capacity: 6,
    seats: [],
    ...extras,
  }
}

describe("studio-bulk-edit", () => {
  it("selecciona todos los elementos del mismo color", () => {
    const elements = [
      table("a", "#ea580c"),
      table("b", "#EA580C"),
      table("c", "#22d3ee"),
      {
        ...table("d", "#ea580c"),
        type: "infrastructure",
        category: "infrastructure",
        subtype: "bar",
      },
    ]
    assert.deepEqual(selectSimilarElementIds(elements, "a"), ["a", "b"])
  })

  it("aplica precio y color en un solo mapa", () => {
    const elements = [table("a", "#111111"), table("b", "#222222")]
    const priced = applyBulkElementPrice(elements, ["a", "b"], 70000)
    const colored = applyBulkElementColor(priced, ["a", "b"], "#f59e0b")
    assert.equal(colored[0]?.price, 70000)
    assert.equal(colored[1]?.price, 70000)
    assert.equal(colored[0]?.color, "#f59e0b")
    assert.equal(colored[1]?.color, "#f59e0b")
  })

  it("aplica capacidad global y regenera sillas", () => {
    const elements = [table("a", "#111111", { chairCount: 4 })]
    const next = applyBulkElementCapacity(elements, ["a"], 10)
    assert.equal(next[0]?.chairCount, 10)
    assert.equal(next[0]?.seats.length, 10)
  })

  it("numera en el orden de selectedIds", () => {
    const elements = [table("c", "#111"), table("a", "#111"), table("b", "#111")]
    const next = applySequentialLabels(elements, ["a", "b", "c"], "Mesa", 1)
    assert.equal(next.find((item) => item.id === "a")?.label, "Mesa 1")
    assert.equal(next.find((item) => item.id === "b")?.label, "Mesa 2")
    assert.equal(next.find((item) => item.id === "c")?.label, "Mesa 3")
  })
})
