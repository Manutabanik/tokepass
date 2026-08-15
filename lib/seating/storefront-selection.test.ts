import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"
import {
  buyerElementTitle,
  dedupeStorefrontItemsById,
  formatStorefrontSelectionGroups,
  formatStorefrontSelectionLabel,
  hydrateStorefrontItemsFromMap,
  resolveStorefrontItemFromMap,
  storefrontFocusCard,
  venueElementSelectionName,
} from "@/lib/seating/storefront-selection"

describe("storefront-selection", () => {
  it("arma el label desde el elemento del mapa, no desde Fila 1", () => {
    assert.equal(
      venueElementSelectionName({
        type: "long_table",
        label: "Mesa 18",
        sectorName: "Grada Amarilla",
        groupName: "Grada Amarilla",
      }),
      "Grada Amarilla · Mesa 18",
    )
  })

  it("resuelve el item por element.id en el layout original", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "tbl-18",
        type: "long_table",
        label: "Mesa 18",
        category: "commercial",
        sectorName: "Grada Amarilla",
        groupName: "Grada Amarilla",
        groupId: "grada-amarilla",
        x: 120,
        y: 80,
        width: 60,
        height: 20,
        rotation: 15,
        price: 12500,
        color: "#f59e0b",
        opacity: 1,
        chairCount: 6,
        sideA: 3,
        sideB: 3,
        sellMode: "group",
        capacity: 6,
        seats: [],
      },
    ]
    const item = resolveStorefrontItemFromMap(map, "tbl-18")
    assert.equal(item?.id, "tbl-18")
    assert.equal(item?.name, "Grada Amarilla · Mesa 18")
    assert.equal(item?.price, 12500)
    assert.equal(item?.type, "table")
    assert.equal(item?.capacity, 6)
  })

  it("hidrata el carrito con el objeto vivo del mapa", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "tbl-18",
        type: "round_table",
        label: "Mesa 18",
        category: "commercial",
        sectorName: "Platea",
        groupName: "Platea",
        x: 10,
        y: 10,
        width: 28,
        height: 28,
        rotation: 0,
        price: 8000,
        color: "#22d3ee",
        opacity: 1,
        chairCount: 4,
        sideA: 0,
        sideB: 0,
        sellMode: "group",
        capacity: 4,
        seats: [],
      },
    ]
    const next = hydrateStorefrontItemsFromMap(
      [
        {
          id: "tbl-18",
          name: "Grada Amarilla · Fila 1 · 1",
          type: "seat",
          price: 0,
          capacity: 1,
        },
      ],
      map,
    )
    assert.equal(next[0]?.name, "Platea · Mesa 18")
    assert.equal(next[0]?.price, 8000)
    assert.equal(next[0]?.type, "table")
  })

  it("descarta ids duplicados al hidratar", () => {
    const next = dedupeStorefrontItemsById([
      { id: "s-1", name: "A", type: "seat", price: 10, capacity: 1, row: "1", number: 1 },
      { id: "s-1", name: "A", type: "seat", price: 10, capacity: 1, row: "1", number: 1 },
      { id: "s-2", name: "B", type: "seat", price: 10, capacity: 1, row: "1", number: 2 },
    ])
    assert.equal(next.length, 2)
    assert.deepEqual(next.map((item) => item.id), ["s-1", "s-2"])
  })

  it("agrupa asientos por sector y fila sin repetir numeros", () => {
    const groups = formatStorefrontSelectionGroups([
      {
        id: "a",
        name: "Grada Amarilla · Fila 1 · 1",
        type: "seat",
        price: 1000,
        capacity: 1,
        sectorId: "grada",
        row: "1",
        number: 1,
      },
      {
        id: "b",
        name: "Grada Amarilla · Fila 1 · 1",
        type: "seat",
        price: 1000,
        capacity: 1,
        sectorId: "grada",
        row: "1",
        number: 1,
      },
      {
        id: "c",
        name: "Grada Amarilla · Fila 1 · 2",
        type: "seat",
        price: 1000,
        capacity: 1,
        sectorId: "grada",
        row: "1",
        number: 2,
      },
      {
        id: "d",
        name: "Grada Amarilla · Fila 1 · 3",
        type: "seat",
        price: 1000,
        capacity: 1,
        sectorId: "grada",
        row: "1",
        number: 3,
      },
    ])
    assert.equal(groups.length, 1)
    assert.equal(
      groups[0]?.label,
      "Grada Amarilla · Fila 1 - Asientos: 1, 2, 3",
    )
    assert.deepEqual(groups[0]?.ids, ["a", "b", "c", "d"])
  })

  it("formatea mesas con nombre unico y no como asientos repetidos", () => {
    const label = formatStorefrontSelectionLabel([
      {
        id: "tbl-18",
        name: "Grada Amarilla · Mesa 18",
        type: "table",
        price: 8000,
        capacity: 1,
      },
      {
        id: "tbl-18",
        name: "Grada Amarilla · Mesa 18",
        type: "table",
        price: 8000,
        capacity: 1,
      },
    ])
    assert.equal(label, "Grada Amarilla · Mesa 18")
  })

  it("arma el titulo de comprador como Tipo + Numero", () => {
    assert.equal(
      buyerElementTitle({
        type: "long_table",
        label: "18",
      }),
      "Tablón 18",
    )
    assert.equal(
      buyerElementTitle({
        type: "long_table",
        label: "Tablón 18",
      }),
      "Tablón 18",
    )
  })

  it("arma la tarjeta de detalle desde el elemento vivo", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "tbl-18",
        type: "long_table",
        label: "18",
        category: "commercial",
        sectorName: "Mesas",
        groupName: "Mesas",
        x: 10,
        y: 10,
        width: 60,
        height: 20,
        rotation: 0,
        price: 70000,
        color: "#f59e0b",
        opacity: 1,
        chairCount: 8,
        sideA: 4,
        sideB: 4,
        sellMode: "group",
        capacity: 8,
        seats: [],
      },
    ]
    const card = storefrontFocusCard(
      {
        id: "tbl-18",
        name: "Mesas · Tablón 18",
        type: "table",
        price: 70000,
        capacity: 1,
      },
      map,
    )
    assert.equal(card.title, "Tablón 18")
    assert.equal(card.sector, "Sector Mesas")
    assert.equal(card.capacityLabel, "8 Asientos")
    assert.equal(card.price, 70000)
  })
})
