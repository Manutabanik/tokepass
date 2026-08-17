import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  chunkSeatMatrixGroups,
  compactSeatToken,
  formatSeatChunkTitle,
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

  it("oculta ocupados y arma titulos Mesa 1 a 10", () => {
    const seats = Array.from({ length: 12 }, (_, index) => ({
      id: `m${index + 1}`,
      number: index + 1,
      label: `Mesa ${index + 1}`,
      price: 10,
      status:
        index === 11
          ? ("occupied" as const)
          : ("available" as const),
    }))
    const chunks = chunkSeatMatrixGroups([{ title: "Mesa", seats }])
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0]?.title, "Mesa 1 a 10")
    assert.equal(chunks[0]?.seats.length, 10)
    assert.equal(chunks[1]?.title, "Mesa 11")
  })

  it("formatea rangos de fila sin mostrar ocupados", () => {
    assert.equal(
      formatSeatChunkTitle("Fila 3", [
        {
          id: "a",
          number: 1,
          label: "1",
          price: 10,
          status: "available",
        },
        {
          id: "b",
          number: 4,
          label: "4",
          price: 10,
          status: "available",
        },
      ]),
      "Fila 3 · 1 a 4",
    )
  })
})
