import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"
import {
  addSelectedSeatToCartItem,
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
  it("guarda displayName al agregar una silla al carrito", () => {
    const item = addSelectedSeatToCartItem(
      {
        id: "s-1",
        seat_number: 2,
        price: 20000,
        is_available: true,
        custom_label: "Silla Preferencial VIP A",
      },
      { id: "t-1", table_number: 4, custom_label: "Mesa VIP Escenario", seats: [] },
      "VIP",
    )
    assert.equal(item.name, "Silla Preferencial VIP A")
    assert.equal(item.displayName, "Silla Preferencial VIP A")
    assert.equal(item.price, 20000)
  })

  it("usa customLabel como nombre de carrito e impresión", () => {
    assert.equal(
      venueElementSelectionName({
        type: "round_table",
        label: "Mesa 4",
        sectorName: "VIP",
        customLabel: "Mesa VIP Escenario 1",
      }),
      "Mesa VIP Escenario 1",
    )
  })

  it("arma el label desde el elemento del mapa, no desde Fila 1", () => {
    assert.equal(
      venueElementSelectionName({
        type: "long_table",
        label: "Mesa 18",
        sectorName: "Grada Amarilla",
        groupName: "Grada Amarilla",
      }),
      "Sector Grada Amarilla - Mesa 18",
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
    assert.equal(item?.name, "Sector Grada Amarilla - Mesa 18")
    assert.equal(item?.displayName, "Sector Grada Amarilla - Mesa 18")
    assert.equal(item?.price, 12500)
    assert.equal(item?.type, "table")
    assert.equal(item?.capacity, 6)
    assert.equal(item?.sellMode, "group")
    assert.equal(item?.priceMode, "closed_unit")
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
    assert.equal(next[0]?.name, "Sector Platea - Mesa 18")
    assert.equal(next[0]?.price, 8000)
    assert.equal(next[0]?.type, "table")
  })

  it("conserva la cantidad elegida al hidratar una zona general", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22c55e",
        price: 50000,
        polygon: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
          { x: 0, y: 40 },
        ],
        layoutType: "general",
        seatingType: "GENERAL",
        sellMode: "per_seat",
        rows: 0,
        itemsPerRow: 0,
        capacityPerUnit: 1,
        capacity: 200,
        labelPrefix: "",
      },
    ]
    const next = hydrateStorefrontItemsFromMap(
      [
        {
          id: "campo",
          name: "Campo",
          type: "zone",
          price: 50000,
          capacity: 3,
          inventoryType: "GENERAL_ADMISSION",
        },
      ],
      map,
    )
    assert.equal(next[0]?.capacity, 3)
    assert.equal(next[0]?.type, "zone")
    assert.equal(next[0]?.price, 50000)
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
      "Grada Amarilla - Fila 1, Sillas 1, 2, 3",
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
    assert.equal(label, "Mesa completa (Incluye 1 accesos)")
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

  it("no multiplica el precio cerrado de una mesa por las sillas", () => {
    const groups = formatStorefrontSelectionGroups([
      {
        id: "tbl-1",
        name: "Grada Amarilla · Mesa 1",
        type: "table",
        price: 58824,
        capacity: 6,
        sellMode: "group",
        priceMode: "closed_unit",
      },
    ])
    assert.equal(groups[0]?.price, 58824)
  })

  it("cuenta una mesa TABLES como un solo SKU aunque tenga sillas", () => {
    const groups = formatStorefrontSelectionGroups([
      {
        id: "tbl-1",
        name: "Grada Amarilla · Mesa 1",
        type: "table",
        price: 58824,
        capacity: 6,
        inventoryType: "TABLES",
        sellMode: "per_seat",
        priceMode: "per_person",
      },
    ])
    assert.equal(groups[0]?.price, 58824)
    assert.equal(groups[0]?.placeLabel, "Mesa completa (Incluye 6 accesos)")
  })
})
