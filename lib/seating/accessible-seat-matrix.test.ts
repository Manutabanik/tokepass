import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  compactSeatToken,
  groupSeatsForMatrix,
  seatGroupKey,
} from "./accessible-seat-matrix"

describe("accessible-seat-matrix", () => {
  it("deja solo el numero final del asiento", () => {
    assert.equal(compactSeatToken("Mesas · Mesa 01"), "01")
    assert.equal(compactSeatToken("Mesa 7"), "07")
    assert.equal(compactSeatToken("Fila 3-12", 12), "12")
  })

  it("agrupa mesas por prefijo y filas por numero", () => {
    assert.equal(seatGroupKey({ row: "Mesa 01", label: "Mesas · Mesa 01" }), "Mesa")
    assert.equal(seatGroupKey({ row: "1", label: "1-4" }), "1")
  })

  it("arma la matriz desde filas sueltas de mesas", () => {
    const groups = groupSeatsForMatrix([
      {
        id: "a",
        label: "Mesa 01",
        seats: [
          {
            id: "m1",
            number: 1,
            label: "Mesas · Mesa 01",
            price: 10,
            status: "available",
          },
        ],
      },
      {
        id: "b",
        label: "Mesa 02",
        seats: [
          {
            id: "m2",
            number: 2,
            label: "Mesas · Mesa 02",
            price: 10,
            status: "available",
          },
        ],
      },
    ])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.title, "Mesa")
    assert.equal(groups[0]?.seats.length, 2)
  })
})
