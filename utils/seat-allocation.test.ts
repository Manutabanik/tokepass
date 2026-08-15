import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  findBestAvailableSeats,
  type Seat,
  type SeatAllocationStatus,
} from "./seat-allocation"

function seat(
  number: number,
  status: SeatAllocationStatus = "available",
  row = "1",
): Seat {
  return {
    id: `${row}-${number}`,
    number,
    status,
    row_id: row,
    row_name: row,
    row,
  }
}

function ids(seats: Seat[] | null): string[] | null {
  return seats ? seats.map((item) => item.id) : null
}

describe("findBestAvailableSeats", () => {
  it("prioriza la fila mas cercana al escenario", () => {
    const seats = [
      seat(1, "available", "2"),
      seat(2, "available", "2"),
      seat(1, "available", "1"),
      seat(2, "available", "1"),
    ]
    assert.deepEqual(ids(findBestAvailableSeats(seats, 2)), ["1-1", "1-2"])
  })

  it("exige contiguidad estricta y no salta un ocupado", () => {
    const seats = [
      seat(1),
      seat(2, "occupied"),
      seat(3),
    ]
    assert.equal(findBestAvailableSeats(seats, 2), null)
  })

  it("prefiere un bloque que no deja huerfanos", () => {
    const seats = [
      seat(1),
      seat(2),
      seat(3),
      seat(4, "occupied"),
      seat(5),
      seat(6),
      seat(7),
      seat(8),
    ]
    assert.deepEqual(ids(findBestAvailableSeats(seats, 2)), ["1-5", "1-6"])
  })

  it("usa un bloque suboptimo de la fila cercana antes de cambiar de fila", () => {
    const seats = [
      seat(1, "available", "1"),
      seat(2, "available", "1"),
      seat(3, "occupied", "1"),
      seat(1, "available", "2"),
      seat(2, "available", "2"),
      seat(3, "available", "2"),
      seat(4, "available", "2"),
    ]
    assert.deepEqual(ids(findBestAvailableSeats(seats, 2)), ["1-1", "1-2"])
  })

  it("elige el bloque mas centrado cuando no hay huerfanos", () => {
    const seats = [
      seat(1),
      seat(2),
      seat(3),
      seat(4),
      seat(5),
      seat(6),
    ]
    assert.deepEqual(ids(findBestAvailableSeats(seats, 2)), ["1-3", "1-4"])
  })

  it("devuelve null si no hay un bloque del tamano pedido", () => {
    const seats = [seat(1), seat(2, "occupied"), seat(3)]
    assert.equal(findBestAvailableSeats(seats, 3), null)
  })

  it("no muta el array original", () => {
    const seats = [seat(3), seat(1), seat(2)]
    const snapshot = seats.map((item) => item.id)
    findBestAvailableSeats(seats, 2)
    assert.deepEqual(
      seats.map((item) => item.id),
      snapshot,
    )
  })

  it("respeta rowOrder explicito", () => {
    const seats = [
      seat(1, "available", "A"),
      seat(2, "available", "A"),
      seat(1, "available", "B"),
      seat(2, "available", "B"),
    ]
    assert.deepEqual(
      ids(findBestAvailableSeats(seats, 2, { rowOrder: ["B", "A"] })),
      ["B-1", "B-2"],
    )
  })
})
