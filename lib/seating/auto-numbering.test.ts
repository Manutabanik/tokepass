import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyAutoNumbering,
  applyLabelOverride,
  applyMatrixNumbering,
  rowIndexToLetter,
  theatreSeatNumbers,
} from "./auto-numbering"
import type { VenueMapElement } from "@/types/venue-map"

function stub(
  id: string,
  x: number,
  ringIndex: number,
): VenueMapElement {
  return {
    id,
    type: "round_table",
    label: id,
    category: "commercial",
    sectorName: "Mesa Premium",
    x,
    y: 200,
    width: 36,
    height: 36,
    rotation: 0,
    price: 1,
    color: "#ea580c",
    opacity: 1,
    chairCount: 8,
    sideA: 4,
    sideB: 4,
    sellMode: "group",
    capacity: 8,
    seats: [{ id: `${id}-S1`, number: 1, x, y: 200, status: "available" }],
    groupId: "grada",
    groupName: "Grada",
    ringIndex,
  }
}

function gridChair(
  id: string,
  x: number,
  y: number,
  ringIndex: number,
): VenueMapElement {
  return {
    ...stub(id, x, ringIndex),
    type: "vip_chair",
    y,
    sellMode: "per_seat",
    priceMode: "per_person",
  }
}

describe("auto-numbering", () => {
  it("assigns unique correlative labels from left to right", () => {
    const elements = [stub("a", 300, 0), stub("b", 100, 0), stub("c", 200, 0)]
    const next = applyAutoNumbering(elements, new Set(["a", "b", "c"]), {
      start: 1,
      prefix: "M-",
      suffix: "",
      direction: "ltr",
    })
    const labels = next.map((element) => element.label)
    assert.deepEqual(labels, ["M-03", "M-01", "M-02"])
    assert.equal(new Set(labels).size, 3)
  })

  it("walks inner rings before outer rings", () => {
    const elements = [stub("outer", 120, 1), stub("inner", 80, 0)]
    const next = applyAutoNumbering(elements, new Set(["outer", "inner"]), {
      start: 7,
      prefix: "TAB-",
      suffix: "",
      direction: "inner_to_outer",
    })
    assert.equal(next.find((item) => item.id === "inner")?.label, "TAB-07")
    assert.equal(next.find((item) => item.id === "outer")?.label, "TAB-08")
  })

  it("skips locked labels without shifting neighbors", () => {
    const elements = [
      { ...stub("a", 100, 0), labelLocked: true, label: "Silla de Ruedas" },
      stub("b", 200, 0),
      stub("c", 300, 0),
    ]
    const next = applyAutoNumbering(elements, new Set(["a", "b", "c"]), {
      start: 1,
      prefix: "M-",
      suffix: "",
      direction: "ltr",
    })
    assert.equal(next.find((item) => item.id === "a")?.label, "Silla de Ruedas")
    assert.equal(next.find((item) => item.id === "b")?.label, "M-02")
    assert.equal(next.find((item) => item.id === "c")?.label, "M-03")
  })
})

describe("matrix numbering", () => {
  it("uses Excel-style row letters", () => {
    assert.equal(rowIndexToLetter(0), "A")
    assert.equal(rowIndexToLetter(25), "Z")
    assert.equal(rowIndexToLetter(26), "AA")
  })

  it("numbers theatre aisles odds left and evens right of center", () => {
    assert.deepEqual(theatreSeatNumbers(1), [1])
    assert.deepEqual(theatreSeatNumbers(2), [1, 2])
    assert.deepEqual(theatreSeatNumbers(4), [3, 1, 2, 4])
    assert.deepEqual(theatreSeatNumbers(5), [3, 1, 2, 4, 6])
    assert.deepEqual(theatreSeatNumbers(8), [7, 5, 3, 1, 2, 4, 6, 8])
  })

  it("applies Fila / Asiento labels across a grid block", () => {
    const elements = [
      gridChair("a1", 10, 10, 0),
      gridChair("a2", 30, 10, 0),
      gridChair("b1", 10, 40, 1),
      gridChair("b2", 30, 40, 1),
    ]
    const next = applyMatrixNumbering(elements, elements.map((item) => item.id), {
      rowAxis: "letters",
      aisleMode: "sequential",
    })
    assert.equal(
      next.find((item) => item.id === "a1")?.label,
      "Fila A - Asiento 1",
    )
    assert.equal(
      next.find((item) => item.id === "a2")?.label,
      "Fila A - Asiento 2",
    )
    assert.equal(
      next.find((item) => item.id === "b1")?.label,
      "Fila B - Asiento 1",
    )
    assert.equal(
      next.find((item) => item.id === "b2")?.label,
      "Fila B - Asiento 2",
    )
  })

  it("applies theatre aisle numbers from the center of each row", () => {
    const elements = [
      gridChair("a1", 10, 10, 0),
      gridChair("a2", 30, 10, 0),
      gridChair("a3", 50, 10, 0),
      gridChair("a4", 70, 10, 0),
    ]
    const next = applyMatrixNumbering(elements, elements.map((item) => item.id), {
      rowAxis: "letters",
      aisleMode: "theatre_odds_evens",
    })
    assert.equal(next[0]?.label, "Fila A - Asiento 3")
    assert.equal(next[1]?.label, "Fila A - Asiento 1")
    assert.equal(next[2]?.label, "Fila A - Asiento 2")
    assert.equal(next[3]?.label, "Fila A - Asiento 4")
  })

  it("keeps an individual override when the block is renumbered", () => {
    const seeded = [
      gridChair("a1", 10, 10, 0),
      gridChair("a2", 30, 10, 0),
      gridChair("a3", 50, 10, 0),
    ]
    const overridden = applyLabelOverride(seeded, "a2", "Espacio Técnico")
    const next = applyMatrixNumbering(
      overridden,
      overridden.map((item) => item.id),
      { rowAxis: "numbers", aisleMode: "sequential" },
    )
    assert.equal(next.find((item) => item.id === "a1")?.label, "Fila 1 - Asiento 1")
    assert.equal(next.find((item) => item.id === "a2")?.label, "Espacio Técnico")
    assert.equal(next.find((item) => item.id === "a3")?.label, "Fila 1 - Asiento 3")
    assert.equal(next.find((item) => item.id === "a2")?.labelLocked, true)
  })
})
