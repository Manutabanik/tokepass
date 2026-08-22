import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "@/lib/seating/venue-element-geometry"
import { emptyVenueMap } from "@/types/venue-map"

import {
  classifyElementClick,
  classifyZoneClick,
  isUncontainedSellableElement,
  listUncontainedSellableElements,
  mapClickOpensSeatModal,
  mapClickTargetFromZone,
} from "./map-click-target"

function reservedZone() {
  return {
    id: "vip",
    name: "VIP",
    color: "#f97316",
    price: 20000,
    polygon: [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ],
    layoutType: "table_combo" as const,
    seatingType: "RESERVED" as const,
    sellMode: "group" as const,
    rows: 1,
    itemsPerRow: 1,
    capacityPerUnit: 4,
    capacity: 4,
    labelPrefix: "Mesa ",
  }
}

function generalZone() {
  return {
    id: "campo",
    name: "Campo",
    color: "#22d3ee",
    price: 8000,
    polygon: [
      { x: 10, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 80 },
      { x: 10, y: 80 },
    ],
    layoutType: "general" as const,
    seatingType: "GENERAL" as const,
    sellMode: "per_seat" as const,
    rows: 1,
    itemsPerRow: 1,
    capacityPerUnit: 1,
    capacity: 400,
    labelPrefix: "Campo ",
  }
}

describe("map-click-target", () => {
  it("clasifica un polígono general y uno contenedor", () => {
    const map = emptyVenueMap()
    map.zones = [generalZone(), reservedZone()]
    const table = createVenueElement("round_table", 0, { x: 200, y: 140 })
    table.groupId = "vip"
    map.elements = [table]
    assert.equal(classifyZoneClick(map.zones[0]!, map), "SECTOR_GENERAL")
    assert.equal(classifyZoneClick(map.zones[1]!, map), "SECTOR_NUMERADO")
    assert.equal(
      mapClickOpensSeatModal(mapClickTargetFromZone(map.zones[0]!, map)),
      false,
    )
    assert.equal(
      mapClickOpensSeatModal(mapClickTargetFromZone(map.zones[1]!, map)),
      true,
    )
  })

  it("deja mesas y sillas sueltas fuera de un contenedor", () => {
    const map = emptyVenueMap()
    map.zones = [generalZone(), reservedZone()]
    const freeTable = createVenueElement("round_table", 0, { x: 700, y: 500 })
    const freeChair = createVenueElement("vip_chair", 1, { x: 720, y: 80 })
    freeChair.sectorName = "Libre"
    const contained = createVenueElement("round_table", 2, { x: 200, y: 140 })
    contained.groupId = "vip"
    const onGeneralField = createVenueElement("round_table", 3, { x: 480, y: 280 })
    map.elements = [freeTable, freeChair, contained, onGeneralField]

    assert.equal(classifyElementClick(freeTable, map), "MESA_LIBRE")
    assert.equal(classifyElementClick(freeChair, map), "ASIENTO_LIBRE")
    assert.equal(classifyElementClick(contained, map), null)
    assert.equal(classifyElementClick(onGeneralField, map), "MESA_LIBRE")
    assert.deepEqual(
      listUncontainedSellableElements(map).map((item) => item.id).sort(),
      [freeTable.id, freeChair.id, onGeneralField.id].sort(),
    )
  })

  it("abre el mapa para una grilla paramétrica sin mesas dibujadas", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        ...reservedZone(),
        rows: 4,
        itemsPerRow: 10,
        capacityPerUnit: 8,
        capacity: 320,
      },
    ]
    assert.equal(classifyZoneClick(map.zones[0]!, map), "SECTOR_NUMERADO")
  })

  it("no trata una mesa dentro del polígono reservado como libre", () => {
    const map = emptyVenueMap()
    map.zones = [reservedZone()]
    const inside = createVenueElement("round_table", 0, { x: 200, y: 140 })
    map.elements = [inside]
    assert.equal(isUncontainedSellableElement(inside, map), false)
    assert.equal(classifyZoneClick(map.zones[0]!, map), "SECTOR_NUMERADO")
  })
})
