import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"

import {
  applyLocalStockLocks,
  elementHasCommittedStock,
  elementIdsHaveCommittedStock,
  isCommittedEditorStock,
  layoutIdHasCommittedStock,
  seatKeysHaveCommittedStock,
} from "./editor-stock-lock"

function table(id = "mesa-1") {
  return {
    id,
    type: "round_table" as const,
    label: "Mesa 1",
    category: "commercial" as const,
    sectorName: "VIP",
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    rotation: 0,
    price: 10000,
    color: "#eab308",
    opacity: 1,
    chairCount: 2,
    sideA: 1,
    sideB: 1,
    sellMode: "group" as const,
    capacity: 2,
    seats: [
      { id: `${id}-S1`, number: 1, x: 0, y: 0, status: "available" as const },
      { id: `${id}-S2`, number: 2, x: 8, y: 0, status: "available" as const },
    ],
  }
}

describe("editor-stock-lock", () => {
  it("trata sold, reserved y blocked como stock comprometido", () => {
    assert.equal(isCommittedEditorStock("occupied"), true)
    assert.equal(isCommittedEditorStock("held"), true)
    assert.equal(isCommittedEditorStock("blocked"), true)
    assert.equal(isCommittedEditorStock("available"), false)
  })

  it("bloquea una mesa si una silla del combo está vendida", () => {
    const element = table()
    assert.equal(
      elementHasCommittedStock(element, { "mesa-1-S1": "occupied" }),
      true,
    )
    assert.equal(elementHasCommittedStock(element, {}), false)
  })

  it("inyecta isLocked solo en elementos con stock comprometido", () => {
    const map = emptyVenueMap()
    map.elements = [table("mesa-1"), table("mesa-2")]
    const next = applyLocalStockLocks(map, { "mesa-1": "held" })
    assert.equal(next.elements[0]?.isLocked, true)
    assert.equal(next.elements[1]?.isLocked, undefined)
    assert.equal(map.elements[0]?.isLocked, undefined)
  })

  it("detecta ids y claves de butaca comprometidas", () => {
    const map = emptyVenueMap()
    map.elements = [table("mesa-9")]
    assert.equal(
      elementIdsHaveCommittedStock(map, ["mesa-9"], {
        "mesa-9-S2": "occupied",
      }),
      true,
    )
    assert.equal(
      seatKeysHaveCommittedStock(["sec-1::s-4"], { "s-4": "held" }),
      true,
    )
    assert.equal(
      layoutIdHasCommittedStock({ "s-4": "available" }, "s-4"),
      false,
    )
  })
})
