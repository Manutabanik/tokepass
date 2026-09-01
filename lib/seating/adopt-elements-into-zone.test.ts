import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueZone } from "./adaptive-seating"
import {
  adoptElementIntoZone,
  adoptElementsIntoZone,
  resolveDropZoneId,
} from "./adopt-elements-into-zone"
import { createVenueElement } from "./venue-element-geometry"
import { canvasPointToPercent } from "./venue-polygon"
import { emptyVenueMap } from "@/types/venue-map"

function vipZone() {
  const zone = createVenueZone(0, [
    canvasPointToPercent({ x: 80, y: 56 }),
    canvasPointToPercent({ x: 400, y: 56 }),
    canvasPointToPercent({ x: 400, y: 280 }),
    canvasPointToPercent({ x: 80, y: 280 }),
  ])
  zone.id = "zona-vip"
  zone.name = "VIP"
  zone.color = "#22d3ee"
  zone.price = 15000
  return zone
}

describe("adopt-elements-into-zone", () => {
  it("asigna zoneId, color, sectorName y precio de la zona receptora", () => {
    const zone = vipZone()
    const mesa = createVenueElement("round_table", 0, { x: 200, y: 140 })
    mesa.id = "mesa-1"
    mesa.color = "#64748b"
    mesa.sectorName = "General"
    mesa.price = 0
    const map = { ...emptyVenueMap(), zones: [zone], elements: [mesa] }
    const adopted = adoptElementsIntoZone(map, zone.id, [mesa.id]).elements[0]!
    assert.equal(adopted.zoneId, "zona-vip")
    assert.equal(adopted.color, "#22d3ee")
    assert.equal(adopted.sectorName, "VIP")
    assert.equal(adopted.price, 15000)
    assert.equal(adopted.groupId, "zona-vip")
    assert.equal(adopted.groupName, "VIP")
  })

  it("no pisa un groupId de mobiliario custom", () => {
    const mesa = createVenueElement("round_table", 0, { x: 200, y: 140 })
    mesa.groupId = "grupo-mesas"
    mesa.groupName = "Mesas"
    mesa.zoneId = "zona-vieja"
    const next = adoptElementIntoZone(mesa, {
      id: "zona-vip",
      name: "VIP",
      color: "#22d3ee",
      price: 0,
    })
    assert.equal(next.zoneId, "zona-vip")
    assert.equal(next.groupId, "grupo-mesas")
    assert.equal(next.groupName, "Mesas")
    assert.equal(next.color, "#22d3ee")
    assert.equal(next.sectorName, "VIP")
  })

  it("actualiza groupId si apuntaba a la zona anterior", () => {
    const mesa = createVenueElement("round_table", 0, { x: 200, y: 140 })
    mesa.zoneId = "zona-vieja"
    mesa.groupId = "zona-vieja"
    mesa.groupName = "Vieja"
    const next = adoptElementIntoZone(mesa, {
      id: "zona-nueva",
      name: "Platea",
      color: "#f97316",
      price: 0,
    })
    assert.equal(next.groupId, "zona-nueva")
    assert.equal(next.groupName, "Platea")
  })

  it("no muta infraestructura", () => {
    const stage = createVenueElement(
      "infrastructure",
      0,
      { x: 200, y: 140 },
      "stage",
    )
    const next = adoptElementIntoZone(stage, {
      id: "zona-vip",
      name: "VIP",
      color: "#22d3ee",
      price: 10,
    })
    assert.equal(next, stage)
    assert.equal(next.zoneId, stage.zoneId)
    assert.equal(next.color, stage.color)
  })

  it("usa hoveredZoneId y cae al hit-test espacial", () => {
    const zone = vipZone()
    const mesa = createVenueElement("round_table", 0, { x: 200, y: 140 })
    assert.equal(resolveDropZoneId([mesa], [zone], "zona-vip"), "zona-vip")
    assert.equal(resolveDropZoneId([mesa], [zone], null), "zona-vip")
    const outside = createVenueElement("round_table", 1, { x: 700, y: 500 })
    assert.equal(resolveDropZoneId([outside], [zone], null), null)
    assert.equal(resolveDropZoneId([outside], [zone], "zona-fantasma"), null)
  })

  it("no toca elementos que no estan en la seleccion", () => {
    const zone = vipZone()
    const mesa = createVenueElement("round_table", 0, { x: 200, y: 140 })
    mesa.id = "mesa-1"
    const other = createVenueElement("round_table", 1, { x: 220, y: 160 })
    other.id = "mesa-2"
    other.color = "#111111"
    const map = { ...emptyVenueMap(), zones: [zone], elements: [mesa, other] }
    const next = adoptElementsIntoZone(map, zone.id, [mesa.id])
    assert.equal(next.elements[0]?.zoneId, "zona-vip")
    assert.equal(next.elements[1]?.zoneId, other.zoneId)
    assert.equal(next.elements[1]?.color, "#111111")
  })
})
