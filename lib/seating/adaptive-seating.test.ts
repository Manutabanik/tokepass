import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  countFreeByParametricRow,
  expandParametricZone,
  expectedParametricUnitCount,
  listAdaptiveOccupancySectorIds,
  listMicroOccupancySectorIds,
  listParametricZoneRowMeta,
  listParametricZoneRows,
  mergeParametricOccupancy,
  parametricZoneCapacity,
  parametricZoneItemId,
  parametricZoneItemShortLabel,
  parametricZoneSkuUnitCount,
  parametricZoneSkuUnitLabel,
  parseParametricZoneItemId,
  resolveVenueRenderMode,
} from "./adaptive-seating"
import { flattenVenueMapSeats, venueMapToSeatingLayout } from "./venue-map-geometry"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"
import type { VenueMapZone } from "@/types/venue-map"

function zone(patch: Partial<VenueMapZone> = {}): VenueMapZone {
  return {
    id: "zona-vip",
    name: "VIP Festival",
    color: "#22d3ee",
    price: 80000,
    polygon: [
      { x: 40, y: 40 },
      { x: 220, y: 40 },
      { x: 220, y: 180 },
      { x: 40, y: 180 },
    ],
    layoutType: "table_combo",
    sellMode: "group",
    rows: 2,
    itemsPerRow: 3,
    capacityPerUnit: 8,
    capacity: 48,
    labelPrefix: "Mesa ",
    ...patch,
  }
}

describe("adaptive seating engine", () => {
  it("builds stable parametric layout_item_id values", () => {
    assert.equal(parametricZoneItemId("zona-vip", 1, 1), "zona-vip-R1-I1")
    assert.equal(parametricZoneItemId("zona-vip", 2, 3), "zona-vip-R2-I3")
  })

  it("expands a table zone into seating_layout rows", () => {
    const sector = expandParametricZone(zone())
    assert.equal(sector.id, "zona-vip")
    assert.equal(sector.layout_type, "table_combo")
    assert.equal(sector.rows.length, 2)
    assert.equal(sector.rows[0]?.items.length, 3)
    assert.equal(sector.rows[0]?.items[0]?.id, "zona-vip-R1-I1")
    assert.equal(sector.rows[1]?.items[2]?.id, "zona-vip-R2-I3")
    assert.equal(sector.rows[0]?.items[0]?.label, "Mesa 1")
    assert.equal(sector.capacity_per_unit, 8)
  })

  it("keeps table_combo SKU capacity in physical units, not chairs", () => {
    const tableZone = zone()
    assert.equal(parametricZoneSkuUnitCount(tableZone), 6)
    assert.equal(parametricZoneSkuUnitLabel(tableZone, 6), "mesas")
    assert.equal(parametricZoneCapacity(tableZone), 48)
    assert.equal(expectedParametricUnitCount(tableZone), 6)
  })

  it("projects zones and elements together into seating_layout", () => {
    const map = emptyVenueMap()
    map.zones = [zone()]
    const layout = venueMapToSeatingLayout(map)
    const parametric = layout.find((sector) => sector.id === "zona-vip")
    assert.ok(parametric)
    assert.equal(parametric.rows[0]?.items[0]?.id, "zona-vip-R1-I1")
    assert.equal(flattenVenueMapSeats(map).length, 0)
  })

  it("uses hybrid render when parametric zones and explicit seats coexist", () => {
    const map = emptyVenueMap()
    assert.equal(resolveVenueRenderMode(map), "micro")
    map.zones = [zone()]
    assert.equal(resolveVenueRenderMode(map), "macro")
    map.elements = [
      {
        id: "butaca-1",
        type: "vip_chair",
        label: "1",
        category: "commercial",
        sectorName: "Platea",
        x: 10,
        y: 10,
        width: 12,
        height: 12,
        rotation: 0,
        price: 0,
        color: "#22d3ee",
        opacity: 1,
        chairCount: 1,
        sideA: 1,
        sideB: 1,
        sellMode: "per_seat",
        capacity: 1,
        seats: [],
      },
    ]
    assert.equal(resolveVenueRenderMode(map), "hybrid")
  })

  it("builds compact strip labels without changing inventory ids", () => {
    assert.equal(parametricZoneItemShortLabel("table_combo", 1), "T-01")
    assert.equal(parametricZoneItemShortLabel("numbered_seat", 12), "B-12")
    assert.deepEqual(parseParametricZoneItemId("zona-vip-R2-I3"), {
      zoneId: "zona-vip",
      row: 2,
      col: 3,
    })
    const free = countFreeByParametricRow("zona-vip", {
      "zona-vip-R1-I1": {
        id: "zona-vip-R1-I1",
        label: "Mesa 1",
        status: "available",
        seatingUnitId: "unit-1",
      },
      "zona-vip-R2-I1": {
        id: "zona-vip-R2-I1",
        label: "Mesa 4",
        status: "occupied",
        seatingUnitId: "unit-2",
      },
    })
    assert.equal(free[1], 1)
    assert.equal(free[2], undefined)
  })

  it("lists parametric strip rows without flattening every item", () => {
    const rows = listParametricZoneRows(zone())
    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.rowLabel, "Fila 1")
    assert.equal(rows[0]?.items.length, 3)
    assert.equal(rows[1]?.items[2]?.id, "zona-vip-R2-I3")
  })

  it("expands numbered seats with an asymmetric rowsConfig", () => {
    const platea = zone({
      layoutType: "numbered_seat",
      sellMode: "per_seat",
      rows: 3,
      itemsPerRow: 10,
      capacityPerUnit: 1,
      capacity: 150,
      labelPrefix: "Butaca ",
      rowsConfig: [
        { label: "1", seatCount: 20 },
        { label: "2", seatCount: 50 },
        { label: "3", seatCount: 80 },
      ],
    })
    const sector = expandParametricZone(platea)
    assert.equal(expectedParametricUnitCount(platea), 150)
    assert.equal(parametricZoneSkuUnitCount(platea), 150)
    assert.equal(sector.rows.length, 3)
    assert.equal(sector.rows[0]?.items.length, 20)
    assert.equal(sector.rows[1]?.items.length, 50)
    assert.equal(sector.rows[2]?.items.length, 80)
    assert.equal(sector.rows[0]?.items[0]?.id, "zona-vip-R1-I1")
    assert.equal(sector.rows[2]?.items[79]?.id, "zona-vip-R3-I80")
    assert.equal(sector.rows[0]?.items[0]?.label, "Butaca 1")
    assert.equal(sector.rows[1]?.items[0]?.label, "Butaca 21")
    assert.equal(sector.rows[2]?.items[0]?.label, "Butaca 71")
  })

  it("does not flatten every parametric item until a row is opened", () => {
    const meta = listParametricZoneRowMeta(zone({ rows: 80, itemsPerRow: 80 }))
    assert.equal(meta.length, 80)
    assert.equal(meta[0]?.itemCount, 80)
    assert.equal(expectedParametricUnitCount(zone({ rows: 80, itemsPerRow: 80 })), 6400)
  })

  it("keeps parametric items unavailable until SQL units exist", () => {
    const empty = mergeParametricOccupancy({ zone: zone(), units: [] })
    assert.equal(empty.state, "unmaterialized")
    assert.equal(Object.keys(empty.byLayoutItemId).length, 0)

    const ready = mergeParametricOccupancy({
      zone: zone(),
      units: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          layoutItemId: "zona-vip-R1-I1",
          status: "available",
          label: "Mesa 1",
        },
      ],
    })
    assert.equal(ready.state, "ready")
    assert.equal(ready.byLayoutItemId["zona-vip-R1-I1"]?.seatingUnitId, "11111111-1111-4111-8111-111111111111")
    assert.equal(ready.byLayoutItemId["zona-vip-R1-I2"], undefined)
  })

  it("lists micro occupancy ids without parametric zones", () => {
    const map = emptyVenueMap()
    map.zones = [zone()]
    map.elements = [
      {
        id: "butaca-1",
        type: "vip_chair",
        label: "1",
        category: "commercial",
        sectorName: "Platea",
        x: 10,
        y: 10,
        width: 12,
        height: 12,
        rotation: 0,
        price: 0,
        color: "#22d3ee",
        opacity: 1,
        chairCount: 1,
        sideA: 1,
        sideB: 1,
        sellMode: "per_seat",
        capacity: 1,
        seats: [],
      },
    ]
    const ids = listAdaptiveOccupancySectorIds(map)
    const micro = listMicroOccupancySectorIds(map)
    assert.ok(ids.includes("zona-vip"))
    assert.ok(ids.includes("butaca-1"))
    assert.ok(micro.includes("butaca-1"))
    assert.equal(micro.includes("zona-vip"), false)
  })

  it("parses legacy maps without zones as an empty array", () => {
    const map = parseVenueMap({
      version: 1,
      sectors: [],
      elements: [],
      background_image: "https://cdn.example.com/festival.jpg",
    })
    assert.deepEqual(map.zones, [])
    assert.equal(map.backgroundImage, "https://cdn.example.com/festival.jpg")
  })

  it("parses a festival zone polygon from JSON", () => {
    const map = parseVenueMap({
      zones: [
        {
          id: "campo",
          name: "Campo",
          color: "#a3e635",
          polygon: [
            { x: 10, y: 10 },
            { x: 90, y: 10 },
            { x: 90, y: 90 },
          ],
          layout_type: "general",
          capacity: 20000,
        },
      ],
    })
    assert.equal(map.zones.length, 1)
    assert.equal(map.zones[0]?.layoutType, "general")
    assert.equal(map.zones[0]?.capacity, 20000)
    assert.equal(resolveVenueRenderMode(map), "macro")
  })
})
