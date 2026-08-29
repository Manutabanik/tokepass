import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import {
  CONTEXT_FOCUS_MAX_SCALE,
  CONTEXT_FOCUS_MIN_SCALE,
  CONTEXT_FOCUS_PADDING,
  CONTEXT_FOCUS_STAGE_TOP,
  CLIENT_CONTENT_FILL,
  drawableContentAabb,
  elementBelongsToZone,
  fitDrawableContentCamera,
  expandSelectionForContext,
  lodCameraTransform,
  pointInPolygon,
  publicRevealElements,
  publicRevealSeats,
  resolveLodZones,
  shouldEnableMapLod,
  synthesizeLodZones,
  zoneCanvasAabb,
} from "./venue-map-lod"
import { VENUE_MAP_CANVAS } from "@/lib/seating/venue-polygon"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"
import type { VenueMapZone } from "@/types/venue-map"

function zone(patch: Partial<VenueMapZone> = {}): VenueMapZone {
  return {
    id: "zona-vip",
    name: "VIP",
    color: "#22d3ee",
    price: 0,
    polygon: [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
      { x: 10, y: 40 },
    ],
    layoutType: "table_combo",
    sellMode: "group",
    rows: 2,
    itemsPerRow: 2,
    capacityPerUnit: 4,
    capacity: 16,
    labelPrefix: "Mesa ",
    ...patch,
  }
}

describe("venue-map-lod", () => {
  it("acepta zonas rectangulares y points en el JSON", () => {
    const fromRect = parseVenueMap({
      zones: [
        {
          id: "campo",
          name: "Campo",
          color: "#f97316",
          x: 80,
          y: 56,
          width: 160,
          height: 112,
        },
      ],
    })
    assert.equal(fromRect.zones[0]?.polygon.length, 4)
    assert.equal(fromRect.zones[0]?.name, "Campo")

    const fromPoints = parseVenueMap({
      zones: [
        {
          id: "platea",
          name: "Platea",
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
          ],
        },
      ],
    })
    assert.equal(fromPoints.zones[0]?.polygon.length, 3)
  })

  it("detecta un punto dentro del poligono de la zona", () => {
    const vip = zone()
    assert.equal(pointInPolygon({ x: 200, y: 140 }, vip.polygon), true)
    assert.equal(pointInPolygon({ x: 10, y: 10 }, vip.polygon), false)
  })

  it("asocia mesas por groupId, nombre o posicion", () => {
    const vip = zone()
    const byGroup = createVenueElement("round_table", 0, { x: 10, y: 10 })
    byGroup.groupId = "zona-vip"
    const byName = createVenueElement("round_table", 1, { x: 10, y: 10 })
    byName.sectorName = "VIP"
    const byPoint = createVenueElement("round_table", 2, { x: 200, y: 140 })
    const outside = createVenueElement("round_table", 3, { x: 700, y: 500 })
    assert.equal(elementBelongsToZone(byGroup, vip), true)
    assert.equal(elementBelongsToZone(byName, vip), true)
    assert.equal(elementBelongsToZone(byPoint, vip), true)
    assert.equal(elementBelongsToZone(outside, vip), false)
  })

  it("prioriza zoneId sobre la posicion espacial", () => {
    const vip = zone()
    const linked = createVenueElement(
      "round_table",
      0,
      { x: 700, y: 500 },
      undefined,
      { zoneId: "zona-vip" },
    )
    const other = createVenueElement(
      "round_table",
      1,
      { x: 200, y: 140 },
      undefined,
      { zoneId: "otra-zona" },
    )
    assert.equal(elementBelongsToZone(linked, vip), true)
    assert.equal(elementBelongsToZone(other, vip), false)
  })

  it("puede sintetizar AABB, pero el storefront no los usa", () => {
    const map = emptyVenueMap()
    const a = createVenueElement("round_table", 0, { x: 80, y: 80 })
    const b = createVenueElement("round_table", 1, { x: 500, y: 300 })
    a.groupId = "grada-a"
    a.groupName = "Grada A"
    b.groupId = "grada-b"
    b.groupName = "Grada B"
    map.elements = [a, b]
    const zones = synthesizeLodZones(map)
    assert.equal(zones.length, 2)
    assert.equal(resolveLodZones(map).length, 0)
    assert.equal(shouldEnableMapLod(map), false)
  })

  it("solo activa LOD con poligonos trazados en el Studio", () => {
    const map = emptyVenueMap()
    assert.equal(shouldEnableMapLod(map), false)
    map.zones = [zone()]
    assert.equal(resolveLodZones(map).length, 1)
    assert.equal(shouldEnableMapLod(map), true)
  })

  it("une mesas y asientos y no usa zonas si hay contenido", () => {
    const table = createVenueElement("round_table", 0, { x: 120, y: 140 })
    const box = drawableContentAabb({
      elements: [table],
      seats: [{ x: 200, y: 180 }],
      zones: [zone()],
    })
    assert.ok(box)
    assert.ok(box.minX <= 120)
    assert.ok(box.maxX >= 200)
    assert.ok(box.minY <= 140)
    assert.ok(box.maxY >= 180)
  })

  it("cae a la zona si no hay mesas ni asientos", () => {
    const vip = zone()
    const box = drawableContentAabb({ elements: [], seats: [], zones: [vip] })
    assert.deepEqual(box, zoneCanvasAabb(vip))
  })

  it("encuadra el contenido al 80-90% del viewport", () => {
    const box = { minX: 100, minY: 80, maxX: 220, maxY: 180 }
    const camera = fitDrawableContentCamera(box, 400, 280)
    const visibleX =
      ((box.maxX - box.minX) * camera.scale) / VENUE_MAP_CANVAS.width
    const visibleY =
      ((box.maxY - box.minY) * camera.scale) / VENUE_MAP_CANVAS.height
    const fill = Math.max(visibleX, visibleY)
    assert.ok(fill >= 0.8 && fill <= 0.9)
    assert.equal(camera.scale >= 1, true)
    assert.equal(CLIENT_CONTENT_FILL, 0.85)
  })

  it("calcula la camara para encuadrar el AABB con padding", () => {
    const box = zoneCanvasAabb(zone())
    assert.ok(box)
    const camera = lodCameraTransform(box, 400, 280, { padding: 0.1 })
    assert.equal(camera.scale > 1, true)
    assert.equal(Number.isFinite(camera.positionX), true)
    assert.equal(Number.isFinite(camera.positionY), true)
  })

  it("el foco contextual incluye el escenario y no supera 1.5x", () => {
    const framed = expandSelectionForContext({
      minX: 360,
      minY: 420,
      maxX: 400,
      maxY: 460,
    })
    assert.equal(framed.minY <= CONTEXT_FOCUS_STAGE_TOP, true)
    const camera = lodCameraTransform(framed, 400, 250, {
      padding: CONTEXT_FOCUS_PADDING,
      minScale: CONTEXT_FOCUS_MIN_SCALE,
      maxScale: CONTEXT_FOCUS_MAX_SCALE,
    })
    assert.equal(camera.scale <= CONTEXT_FOCUS_MAX_SCALE, true)
    assert.equal(camera.scale >= 1, true)
  })

  it("en macro no revela inventario; en micro solo el zoneId activo", () => {
    const vip = zone()
    const linked = createVenueElement(
      "round_table",
      0,
      { x: 700, y: 500 },
      undefined,
      { zoneId: "zona-vip" },
    )
    const other = createVenueElement(
      "vip_chair",
      1,
      { x: 20, y: 20 },
      undefined,
      { zoneId: "otra-zona" },
    )
    other.sectorName = "General"
    assert.deepEqual(publicRevealElements([linked, other], null).map((item) => item.id), [])
    assert.deepEqual(
      publicRevealElements([linked, other], vip).map((item) => item.id),
      [linked.id],
    )
    assert.deepEqual(
      publicRevealSeats(
        [
          {
            x: 700,
            y: 500,
            sectorId: "platea",
            sectorName: "Platea",
          },
          {
            x: 200,
            y: 140,
            sectorId: "zona-vip",
            sectorName: "VIP",
          },
        ],
        vip,
      ).map((seat) => seat.sectorId),
      ["zona-vip"],
    )
  })
})
