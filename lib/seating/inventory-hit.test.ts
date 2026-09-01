import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  inventoryHitFromEvent,
  inventoryHitFromNode,
} from "./inventory-hit"

function attrNode(
  attrs: Record<string, string>,
  parent: { getAttribute: (name: string) => string | null } | null = null,
) {
  return {
    getAttribute(name: string) {
      return attrs[name] ?? null
    },
    closest(selector: string) {
      if (selector !== "[data-inventory]") return null
      if (attrs["data-inventory"]) return this
      return parent
    },
  }
}

describe("inventory-hit", () => {
  it("lee butaca de sector desde data attributes", () => {
    const hit = inventoryHitFromNode(
      attrNode({
        "data-inventory": "sector-seat",
        "data-sector-id": "sec-1",
        "data-seat-id": "s-9",
        "data-seat-key": "sec-1::s-9",
      }),
    )
    assert.deepEqual(hit, {
      kind: "sector-seat",
      sectorId: "sec-1",
      seatId: "s-9",
      seatKey: "sec-1::s-9",
    })
  })

  it("prioriza silla de mesa sobre el elemento contenedor en composedPath", () => {
    const chair = attrNode({
      "data-inventory": "element-seat",
      "data-element-id": "mesa-1",
      "data-seat-id": "chair-2",
    })
    const table = attrNode({
      "data-inventory": "element",
      "data-element-id": "mesa-1",
    })
    const hit = inventoryHitFromEvent({
      target: chair,
      composedPath: () => [chair, table],
    })
    assert.deepEqual(hit, {
      kind: "element-seat",
      elementId: "mesa-1",
      seatId: "chair-2",
    })
  })

  it("sube al elemento si el target no tiene data-inventory", () => {
    const table = attrNode({
      "data-inventory": "element",
      "data-element-id": "box-3",
    })
    const child = attrNode({}, table)
    assert.deepEqual(inventoryHitFromNode(child), {
      kind: "element",
      elementId: "box-3",
    })
  })

  it("devuelve null si no hay inventario", () => {
    assert.equal(inventoryHitFromNode(attrNode({})), null)
    assert.equal(inventoryHitFromEvent({ target: null }), null)
  })
})
