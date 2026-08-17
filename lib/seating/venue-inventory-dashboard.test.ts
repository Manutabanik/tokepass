import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import { summarizeVenueInventory } from "./venue-inventory-dashboard"
import { emptyVenueMap } from "@/types/venue-map"

describe("venue-inventory-dashboard", () => {
  it("devuelve empty state si no hay inventario", () => {
    const summary = summarizeVenueInventory(emptyVenueMap())
    assert.equal(summary.hasInventory, false)
    assert.equal(summary.capacity, 0)
    assert.equal(summary.projectedRevenue, 0)
    assert.equal(summary.sectors.length, 0)
  })

  it("agrega aforo, mesas y sectores desde el mapa", () => {
    const map = emptyVenueMap()
    const a = createVenueElement("round_table", 0, { x: 80, y: 80 })
    const b = createVenueElement("round_table", 1, { x: 140, y: 80 })
    const c = createVenueElement("round_table", 2, { x: 400, y: 200 })
    a.groupId = "vip"
    a.groupName = "VIP"
    a.capacity = 8
    a.sellMode = "group"
    a.price = 80000
    a.color = "#f97316"
    b.groupId = "vip"
    b.groupName = "VIP"
    b.capacity = 8
    b.sellMode = "group"
    b.price = 80000
    b.color = "#f97316"
    c.groupId = "general"
    c.groupName = "General"
    c.capacity = 6
    c.sellMode = "group"
    c.price = 40000
    c.color = "#22d3ee"
    map.elements = [a, b, c]

    const summary = summarizeVenueInventory(map)
    assert.equal(summary.hasInventory, true)
    assert.equal(summary.elementCount, 3)
    assert.equal(summary.elementLabel, "Mesas")
    assert.equal(summary.sectorCount, 2)
    assert.equal(summary.capacity >= 3, true)
    const vip = summary.sectors.find((row) => row.name === "VIP")
    assert.ok(vip)
    assert.equal(vip.unitCount, 2)
    assert.equal(vip.price, 80000)
    assert.equal(vip.mode, "tables")
    assert.equal(vip.modeLabel, "Mesas")
    assert.equal(vip.revenue, 160000)
    assert.equal(summary.projectedRevenue, 200000)
  })

  it("cuenta mesas paramétricas como unidades SKU, no como sillas", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
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
      },
    ]

    const summary = summarizeVenueInventory(map)
    const vip = summary.sectors.find((row) => row.id === "zone:zona-vip")
    assert.ok(vip)
    assert.equal(vip.unitCount, 6)
    assert.equal(vip.unitLabel, "mesas")
    assert.equal(vip.people, 48)
    assert.equal(vip.mode, "tables")
    assert.equal(vip.revenue, 480000)
  })
})
