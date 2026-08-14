import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyAutoNumbering } from "./auto-numbering"
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
    category: "Mesa Premium",
    x,
    y: 200,
    width: 36,
    height: 36,
    rotation: 0,
    price: 1,
    color: "#ea580c",
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
})
