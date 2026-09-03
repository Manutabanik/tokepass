import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buyerSelectionUnitIds,
  buyerZonePaint,
  buyerZoneRing,
  shouldRestoreBuyerViewport,
} from "./buyer-map-selection-paint"
import { BUYER_SEAT_FILL } from "@/lib/seating/buyer-seat-fill"
import { emptyVenueMap } from "@/types/venue-map"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

function item(
  patch: Partial<StorefrontSelectedItem> & { id: string },
): StorefrontSelectedItem {
  return {
    name: patch.id,
    type: "seat",
    price: 1000,
    capacity: 1,
    ...patch,
  }
}

describe("buyer-map-selection-paint", () => {
  it("arma ids de asientos, mesas y sillas hijas sin mezclar otra jornada", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "mesa-1",
        type: "round_table",
        category: "commercial",
        label: "Mesa 1",
        sectorName: "VIP",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        rotation: 0,
        price: 0,
        color: "#fff",
        opacity: 1,
        chairCount: 2,
        sideA: 0,
        sideB: 0,
        sellMode: "group",
        capacity: 2,
        seats: [
          { id: "silla-a", number: 1, x: 1, y: 1, status: "available" },
          { id: "silla-b", number: 2, x: 2, y: 2, status: "available" },
        ],
      },
    ]
    const day = "11111111-1111-4111-8111-111111111111"
    const ids = buyerSelectionUnitIds({
      map,
      mapScheduleId: day,
      scheduleDayCount: 2,
      selectedItems: [
        item({ id: "asiento-1", eventDateId: day }),
        item({
          id: "mesa-1",
          type: "table",
          eventDateId: day,
        }),
        item({
          id: "otra-jornada",
          eventDateId: "22222222-2222-4222-8222-222222222222",
        }),
      ],
    })
    assert.equal(ids.has("asiento-1"), true)
    assert.equal(ids.has("mesa-1"), true)
    assert.equal(ids.has("silla-a"), true)
    assert.equal(ids.has("silla-b"), true)
    assert.equal(ids.has("otra-jornada"), false)
  })

  it("restaura la camara solo si un reset espurio llega durante la seleccion", () => {
    assert.equal(
      shouldRestoreBuyerViewport({
        selectionQuiet: true,
        current: { scale: 1, positionX: 0, positionY: 0 },
        saved: { scale: 2.4, positionX: -80, positionY: 40 },
      }),
      true,
    )
    assert.equal(
      shouldRestoreBuyerViewport({
        selectionQuiet: false,
        current: { scale: 1, positionX: 0, positionY: 0 },
        saved: { scale: 2.4, positionX: -80, positionY: 40 },
      }),
      false,
    )
    assert.equal(
      shouldRestoreBuyerViewport({
        selectionQuiet: true,
        current: { scale: 2.4, positionX: -80, positionY: 40 },
        saved: { scale: 2.4, positionX: -80, positionY: 40 },
      }),
      false,
    )
  })
})

describe("buyerZonePaint", () => {
  const base = "#7C3AED"

  it("apaga el agotado y lo saca del alcance del click", () => {
    const paint = buyerZonePaint({ selected: false, soldOut: true, baseColor: base })
    assert.equal(paint.fill, BUYER_SEAT_FILL.sold)
    assert.equal(paint.interactive, false)
    assert.equal(paint.glow, undefined)
    assert.ok(paint.fillOpacity < 0.4)
  })

  it("el agotado gana sobre el carrito: nada de brillar lo que no se vende", () => {
    assert.deepEqual(
      buyerZonePaint({ selected: true, soldOut: true, baseColor: base }),
      buyerZonePaint({ selected: false, soldOut: true, baseColor: base }),
    )
  })

  it("el elegido pasa a solido, con anillo de contraste y resplandor propio", () => {
    const chosen = buyerZonePaint({ selected: true, soldOut: false, baseColor: base })
    const free = buyerZonePaint({ selected: false, soldOut: false, baseColor: base })

    assert.equal(chosen.fill, base)
    assert.equal(free.fill, base)
    assert.ok(chosen.fillOpacity > free.fillOpacity)
    assert.ok(chosen.strokeWidth > free.strokeWidth)
    assert.equal(chosen.stroke, "#FFFFFF")
    assert.equal(free.stroke, base)
    assert.ok(chosen.glow?.includes(base))
    assert.equal(free.glow, undefined)
    assert.equal(chosen.interactive, true)
  })

  it("sobre un sector casi blanco el anillo se oscurece para que se vea", () => {
    assert.equal(buyerZoneRing("#0EA5E9"), "#FFFFFF")
    assert.equal(buyerZoneRing("#F59E0B"), "#FFFFFF")
    assert.notEqual(buyerZoneRing("#FFFFFF"), "#FFFFFF")
    assert.notEqual(buyerZoneRing("#FDE68A"), "#FFFFFF")
  })

  it("un sector sin color elegido cae en el cian del mapa, nunca en vacio", () => {
    const paint = buyerZonePaint({ selected: false, soldOut: false, baseColor: "  " })
    assert.match(paint.fill, /^#[0-9A-Fa-f]{6}$/)
    assert.equal(paint.stroke, paint.fill)
  })
})
