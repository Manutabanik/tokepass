import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampGridArraySize,
  distributeOnArc,
  generateGridArray,
  GRID_ARRAY_MAX_ITEMS,
  gridArrayLabelAt,
  gridArrayPiecesOverlap,
  gridArrayPitch,
  nameGridArray,
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
      // Celdas de 40×40: el primer centro cae en (100, 80).
      area: { minX: 80, minY: 60, maxX: 240, maxY: 180 },
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

  it("estampa la matriz dentro del área dibujada", () => {
    // Cada pieza cae en el centro de su celda, así ninguna se pasa del borde
    // que dibujó el organizador.
    const area = { minX: 100, minY: 200, maxX: 300, maxY: 400 }
    const elements = generateGridArray({
      type: "round_table",
      rows: 2,
      columns: 4,
      area,
    })
    assert.equal(elements.length, 8)
    assert.equal(elements[0]?.x, 125)
    assert.equal(elements[0]?.y, 250)
    assert.equal(elements[7]?.x, 275)
    assert.equal(elements[7]?.y, 350)
    for (const element of elements) {
      assert.ok(element.x >= area.minX && element.x <= area.maxX)
      assert.ok(element.y >= area.minY && element.y <= area.maxY)
    }
  })

  it("crea nodos independientes que se pueden borrar de a uno", () => {
    const elements = generateGridArray({
      type: "long_table",
      rows: 2,
      columns: 3,
      area: { minX: 0, minY: 0, maxX: 600, maxY: 400 },
    })
    const ids = new Set(elements.map((item) => item.id))
    assert.equal(ids.size, 6)
    const points = new Set(elements.map((item) => `${item.x}:${item.y}`))
    assert.equal(points.size, 6)
  })

  it("el paso sale del área y avisa cuando las piezas se pisan", () => {
    const area = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const pitch = gridArrayPitch({ rows: 5, columns: 5, area })
    assert.equal(pitch.x, 20)
    assert.equal(pitch.y, 20)
    assert.equal(gridArrayPiecesOverlap("round_table", pitch), true)
    const roomy = gridArrayPitch({ rows: 1, columns: 1, area })
    assert.equal(gridArrayPiecesOverlap("round_table", roomy), false)
  })

  it("numera la matriz de izquierda a derecha y de arriba abajo", () => {
    const elements = generateGridArray({
      type: "round_table",
      rows: 2,
      columns: 3,
      area: { minX: 0, minY: 0, maxX: 600, maxY: 400 },
    })
    const named = nameGridArray(elements, { prefix: "Mesa", start: 1 })
    // Sin ceros de relleno y con el espacio puesto por nosotros: "Mesa 1".
    assert.deepEqual(
      named.map((item) => item.label),
      ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6"],
    )
    assert.equal(
      named.every((item) => item.hideLabel === undefined),
      true,
    )
  })

  it("respeta el número de inicio y el separador que escribió el organizador", () => {
    const elements = generateGridArray({
      type: "round_table",
      rows: 1,
      columns: 2,
      area: { minX: 0, minY: 0, maxX: 400, maxY: 200 },
    })
    assert.deepEqual(
      nameGridArray(elements, { prefix: "Mesa", start: 25 }).map(
        (item) => item.label,
      ),
      ["Mesa 25", "Mesa 26"],
    )
    assert.deepEqual(
      nameGridArray(elements, { prefix: "M-", start: 1 }).map(
        (item) => item.label,
      ),
      ["M-1", "M-2"],
    )
    assert.equal(gridArrayLabelAt({ prefix: "Mesa", start: 3 }, 2), "Mesa 5")
    assert.equal(gridArrayLabelAt({ prefix: "  ", start: 1 }, 0), "")
  })

  it("sin prefijo esconde la etiqueta pero conserva el nombre interno", () => {
    // El boleto, el manifiesto de la puerta y la validación del layout piden un
    // nombre; lo que el organizador pidió es no verlo dibujado en el plano.
    const elements = generateGridArray({
      type: "round_table",
      rows: 1,
      columns: 2,
      area: { minX: 0, minY: 0, maxX: 400, maxY: 200 },
      labelOffset: 4,
    })
    const named = nameGridArray(elements, { prefix: "", start: 1 })
    assert.equal(
      named.every((item) => item.hideLabel === true),
      true,
    )
    assert.equal(
      named.every((item) => item.label.trim().length > 0),
      true,
    )
    // `labelOffset` continúa la cuenta del plano: dos matrices sin prefijo no
    // dejan dos "Mesa 1" en la lista de la puerta.
    assert.deepEqual(
      named.map((item) => item.label),
      ["Mesa 5", "Mesa 6"],
    )
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
