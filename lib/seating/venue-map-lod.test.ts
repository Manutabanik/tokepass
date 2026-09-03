import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import {
  CONTEXT_FOCUS_MAX_SCALE,
  CONTEXT_FOCUS_MIN_SCALE,
  CONTEXT_FOCUS_PADDING,
  CONTEXT_FOCUS_STAGE_TOP,
  CLIENT_CONTENT_FILL,
  CLIENT_FIT_MIN_SCALE,
  BUYER_FIT_EDGE_PADDING,
  BUYER_MAP_VIEWBOX,
  allMapContentAabb,
  drawableContentAabb,
  fitBuyerMapCamera,
  elementBelongsToZone,
  fitDrawableContentCamera,
  buyerViewportFitSessionKey,
  buyerViewportLooksReset,
  expandSelectionForContext,
  lodCameraTransform,
  mapBackdropOpacity,
  pointInPolygon,
  publicRevealElements,
  publicRevealSeats,
  resolveLodZones,
  shouldEnableMapLod,
  shouldRunBuyerAutoFit,
  synthesizeLodZones,
  zoneCanvasAabb,
  zoneHasRevealableInventory,
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

  it("atenúa la imagen del predio dentro de una zona, sin apagarla", () => {
    assert.equal(
      mapBackdropOpacity({ lodEnabled: true, viewMode: "macro" }),
      1,
    )
    // Fantasma, no cero: entrar a una zona es un zoom sobre algo que el
    // comprador ya estaba mirando, no un corte a un lienzo vacío.
    const inside = mapBackdropOpacity({ lodEnabled: true, viewMode: "micro" })
    assert.ok(inside > 0 && inside < 0.35)
    // Sin zonas trazadas no hay dos niveles, asi que el fondo es el unico
    // contexto que tiene el comprador y se ve entero.
    assert.equal(
      mapBackdropOpacity({ lodEnabled: false, viewMode: "micro" }),
      1,
    )
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
    assert.equal(camera.scale >= CLIENT_FIT_MIN_SCALE, true)
    assert.equal(CLIENT_CONTENT_FILL, 0.85)
    assert.equal(BUYER_FIT_EDGE_PADDING, 0.1)
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

describe("zoom semántico solo con algo adentro", () => {
  it("una zona numerada pero vacía no habilita el micro", () => {
    // `zone()` declara grilla paramétrica (rows/itemsPerRow), que alcanza para
    // que la zona clasifique como numerada aunque nadie haya dibujado piezas
    // adentro. Entrar ahí es un zoom hacia un lienzo vacío.
    const vip = zone()
    assert.equal(zoneHasRevealableInventory([], [], vip), false)
    assert.equal(
      zoneHasRevealableInventory(
        [createVenueElement("round_table", 0, { x: 700, y: 500 })],
        [],
        vip,
      ),
      false,
    )
  })

  it("la decoración no cuenta como inventario para entrar", () => {
    const vip = zone()
    const decor = createVenueElement("infrastructure", 0, { x: 200, y: 140 }, "bar")
    assert.equal(zoneHasRevealableInventory([decor], [], vip), false)
  })

  it("una mesa o un asiento adentro sí habilitan el micro", () => {
    const vip = zone()
    assert.equal(
      zoneHasRevealableInventory(
        [createVenueElement("round_table", 0, { x: 200, y: 140 })],
        [],
        vip,
      ),
      true,
    )
    assert.equal(
      zoneHasRevealableInventory(
        [],
        [{ x: 200, y: 140, sectorId: "otro", sectorName: "Otro" }],
        vip,
      ),
      true,
    )
  })
})

describe("buyer auto-fit isolation", () => {
  it("runs only on the first macro frame of an event/day, not on later selection renders", () => {
    const sessionKey = buyerViewportFitSessionKey("evt-1", "day-1")
    assert.equal(
      shouldRunBuyerAutoFit({
        sessionKey,
        fittedSessionKey: null,
        viewMode: "macro",
        wrapWidth: 390,
        wrapHeight: 520,
      }),
      true,
    )
    assert.equal(
      shouldRunBuyerAutoFit({
        sessionKey,
        fittedSessionKey: sessionKey,
        viewMode: "macro",
        wrapWidth: 390,
        wrapHeight: 480,
      }),
      false,
    )
    assert.equal(
      shouldRunBuyerAutoFit({
        sessionKey: buyerViewportFitSessionKey("evt-1", "day-2"),
        fittedSessionKey: sessionKey,
        viewMode: "macro",
        wrapWidth: 390,
        wrapHeight: 520,
      }),
      true,
    )
    assert.equal(
      shouldRunBuyerAutoFit({
        sessionKey,
        fittedSessionKey: sessionKey,
        viewMode: "macro",
        wrapWidth: 390,
        wrapHeight: 720,
        fittedWidth: 390,
        fittedHeight: 480,
      }),
      true,
    )
    assert.equal(
      shouldRunBuyerAutoFit({
        sessionKey,
        fittedSessionKey: sessionKey,
        viewMode: "macro",
        wrapWidth: 390,
        wrapHeight: 480,
        fittedWidth: 390,
        fittedHeight: 480,
      }),
      false,
    )
  })

  it("no reencuadra al volver del detalle: eso lo hace el botón", () => {
    // Salir de una zona deja `viewMode` en macro pero la sesión ya fue
    // encuadrada y el contenedor no cambió de tamaño, así que este efecto no
    // corre. Por eso `exitLodView()` llama al encuadre él mismo: si delegara
    // acá, la cámara se quedaría con el zoom de la zona y el resto del plano
    // fuera de pantalla, que se ve como si las zonas hubieran desaparecido.
    const sessionKey = buyerViewportFitSessionKey("evt-1", "day-1")
    assert.equal(
      shouldRunBuyerAutoFit({
        sessionKey,
        fittedSessionKey: sessionKey,
        viewMode: "macro",
        wrapWidth: 390,
        wrapHeight: 520,
        fittedWidth: 390,
        fittedHeight: 520,
      }),
      false,
    )
  })

  it("detects a library reset back to identity so zoom/pan can be restored", () => {
    assert.equal(
      buyerViewportLooksReset({ scale: 1, positionX: 0, positionY: 0 }),
      true,
    )
    assert.equal(
      buyerViewportLooksReset({ scale: 2.4, positionX: -80, positionY: 40 }),
      false,
    )
  })
})

describe("buyer map camera", () => {
  function project(
    camera: { scale: number; positionX: number; positionY: number },
    x: number,
    y: number,
    wrapW: number,
    wrapH: number,
  ) {
    const meet = Math.min(
      wrapW / BUYER_MAP_VIEWBOX.width,
      wrapH / BUYER_MAP_VIEWBOX.height,
    )
    const offsetX = (wrapW - BUYER_MAP_VIEWBOX.width * meet) / 2
    const offsetY = (wrapH - BUYER_MAP_VIEWBOX.height * meet) / 2
    return {
      x: camera.positionX + (offsetX + (x - BUYER_MAP_VIEWBOX.x) * meet) * camera.scale,
      y: camera.positionY + (offsetY + (y - BUYER_MAP_VIEWBOX.y) * meet) * camera.scale,
    }
  }

  it("incluye el escenario decorativo en el AABB del checkout", () => {
    const box = allMapContentAabb({
      elements: [],
      seats: [{ x: 200, y: 180 }],
      zones: [],
    })
    assert.ok(box.minY <= -36)
    assert.ok(box.maxY >= 180)
  })

  it("centra el AABB y deja ~10% de aire dentro del wrap", () => {
    const box = { minX: 0, minY: -40, maxX: 800, maxY: 560 }
    const wrapW = 390
    const wrapH = 520
    const camera = fitBuyerMapCamera(box, wrapW, wrapH)
    const mid = project(
      camera,
      (box.minX + box.maxX) / 2,
      (box.minY + box.maxY) / 2,
      wrapW,
      wrapH,
    )
    assert.ok(Math.abs(mid.x - wrapW / 2) < 1)
    assert.ok(Math.abs(mid.y - wrapH / 2) < 1)

    const topLeft = project(camera, box.minX, box.minY, wrapW, wrapH)
    const bottomRight = project(camera, box.maxX, box.maxY, wrapW, wrapH)
    assert.ok(topLeft.x >= wrapW * 0.08)
    assert.ok(topLeft.y >= wrapH * 0.08)
    assert.ok(bottomRight.x <= wrapW * 0.92)
    assert.ok(bottomRight.y <= wrapH * 0.92)
    assert.ok(camera.scale >= CLIENT_FIT_MIN_SCALE)
    assert.ok(camera.scale < 1)
  })

  it("centra el AABB en el hueco entre chrome flotante", () => {
    const box = { minX: 0, minY: -40, maxX: 800, maxY: 560 }
    const wrapW = 390
    const wrapH = 800
    const inset = { top: 104, bottom: 176 }
    const camera = fitBuyerMapCamera(box, wrapW, wrapH, { inset })
    const mid = project(
      camera,
      (box.minX + box.maxX) / 2,
      (box.minY + box.maxY) / 2,
      wrapW,
      wrapH,
    )
    const holeTop = inset.top
    const holeBottom = wrapH - inset.bottom
    const holeCy = (holeTop + holeBottom) / 2
    assert.ok(Math.abs(mid.x - wrapW / 2) < 1)
    assert.ok(Math.abs(mid.y - holeCy) < 1)

    const topLeft = project(camera, box.minX, box.minY, wrapW, wrapH)
    const bottomRight = project(camera, box.maxX, box.maxY, wrapW, wrapH)
    assert.ok(topLeft.y >= holeTop)
    assert.ok(bottomRight.y <= holeBottom)
  })
})
