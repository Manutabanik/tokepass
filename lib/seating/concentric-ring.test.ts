import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  aisleSegments,
  anglesAlongSegments,
  generateConcentricRing,
  polarFromUp,
} from "./concentric-ring"

const base = {
  groupId: "grada-naranja",
  groupName: "Grada Naranja",
  color: "#ea580c",
  centerX: 400,
  centerY: 480,
  startAngle: -60,
  endAngle: 60,
  innerRadius: 90,
  outerRadius: 220,
  rows: 3,
  rowTypes: ["round_table", "long_table", "vip_chair"] as const,
  countPerRow: ["auto", "auto", "auto"] as Array<number | "auto">,
  aisle: true,
  aisleWidthDeg: 16,
  aisleCenterDeg: 0,
  price: 45000,
}

describe("concentric-ring", () => {
  it("places the 0° point above the center", () => {
    const point = polarFromUp(400, 400, 100, 0)
    assert.equal(point.x, 400)
    assert.equal(point.y, 300)
  })

  it("splits the fan around a central aisle", () => {
    const segments = aisleSegments(-60, 60, true, 0, 20)
    assert.equal(segments.length, 2)
    assert.equal(segments[0]!.end < 0, true)
    assert.equal(segments[1]!.start > 0, true)
  })

  it("distributes counts without overlapping angles", () => {
    const angles = anglesAlongSegments(
      [
        { start: -60, end: -10 },
        { start: 10, end: 60 },
      ],
      8,
    )
    assert.equal(angles.length, 8)
    const unique = new Set(angles.map((angle) => angle.toFixed(3)))
    assert.equal(unique.size, 8)
  })

  it("generates unique ids and group metadata for mixed rows", () => {
    const elements = generateConcentricRing({ ...base, rowTypes: [...base.rowTypes] })
    assert.equal(elements.length > 6, true)
    const ids = new Set(elements.map((element) => element.id))
    assert.equal(ids.size, elements.length)
    assert.equal(
      elements.every((element) => element.groupId === "grada-naranja"),
      true,
    )
    const tables = elements.filter((element) => element.type === "round_table")
    assert.equal(tables.every((element) => element.sellMode === "group"), true)
    const chairs = elements.filter((element) => element.type === "vip_chair")
    assert.equal(chairs.every((element) => element.sellMode === "per_seat"), true)
  })

  it("leaves a gap near 0° when the aisle is enabled", () => {
    const withAisle = generateConcentricRing({
      ...base,
      rows: 1,
      rowTypes: ["round_table"],
      countPerRow: [12],
      aisle: true,
      aisleWidthDeg: 24,
    })
    const without = generateConcentricRing({
      ...base,
      rows: 1,
      rowTypes: ["round_table"],
      countPerRow: [12],
      aisle: false,
    })
    const minAbs = Math.min(
      ...withAisle.map((element) => Math.abs(element.rotation)),
    )
    const minAbsClosed = Math.min(
      ...without.map((element) => Math.abs(element.rotation)),
    )
    assert.equal(minAbs > minAbsClosed, true)
  })
})
