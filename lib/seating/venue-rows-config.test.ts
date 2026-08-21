import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  normalizeRowsConfig,
  resizeRowsConfig,
  rowsConfigFromGrid,
  rowsConfigGridFields,
  totalSeatsFromRowsConfig,
} from "./venue-rows-config"
import { parseVenueMap } from "@/types/venue-map"

describe("venue-rows-config", () => {
  it("builds a uniform matrix from rows x seats", () => {
    const rows = rowsConfigFromGrid(3, 10)
    assert.equal(rows.length, 3)
    assert.equal(rows[0]?.seatCount, 10)
    assert.equal(totalSeatsFromRowsConfig(rows), 30)
  })

  it("keeps asymmetric seat counts and derived grid fields", () => {
    const rows = normalizeRowsConfig(
      [
        { label: "1", seatCount: 20 },
        { label: "2", seatCount: 50 },
        { label: "3", seatCount: 80 },
      ],
      { rows: 3, seatsPerRow: 10 },
    )
    assert.deepEqual(rowsConfigGridFields(rows), {
      rows: 3,
      itemsPerRow: 80,
      capacity: 150,
    })
  })

  it("grows and shrinks the matrix from the last seat count", () => {
    const grown = resizeRowsConfig(
      [
        { label: "1", seatCount: 20 },
        { label: "2", seatCount: 50 },
      ],
      3,
    )
    assert.equal(grown.length, 3)
    assert.equal(grown[2]?.seatCount, 50)
    assert.equal(resizeRowsConfig(grown, 1).length, 1)
  })

  it("parses rowsConfig from saved venue_map JSON without dropping rows", () => {
    const map = parseVenueMap({
      zones: [
        {
          id: "platea",
          name: "Platea",
          color: "#22d3ee",
          polygon: [
            { x: 10, y: 10 },
            { x: 40, y: 10 },
            { x: 40, y: 40 },
          ],
          layoutType: "numbered_seat",
          rows: 2,
          itemsPerRow: 10,
          rowsConfig: [
            { label: "1", seatCount: 4 },
            { label: "2", seatCount: 12 },
          ],
        },
      ],
    })
    assert.equal(map.zones[0]?.rowsConfig?.length, 2)
    assert.equal(map.zones[0]?.rowsConfig?.[1]?.seatCount, 12)
    assert.equal(map.zones[0]?.rows, 2)
    assert.equal(map.zones[0]?.itemsPerRow, 12)
  })
})
