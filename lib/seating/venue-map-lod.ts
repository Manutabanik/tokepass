import { elementAabb, unionAabb, type Aabb } from "@/lib/seating/venue-transform"
import {
  canvasPointToPercent,
  isPointInPolygon,
  polygonToCanvas,
  VENUE_MAP_CANVAS,
} from "@/lib/seating/venue-polygon"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueMapPoint,
  type VenueMapZone,
} from "@/types/venue-map"

export type MapLodMode = "macro" | "micro"

export const LOD_CAMERA_PADDING = 0.1
export const LOD_OPACITY_MS = 300
export const CONTEXT_FOCUS_MAX_SCALE = 1.5
export const CONTEXT_FOCUS_MIN_SCALE = 1
export const CONTEXT_FOCUS_PADDING = 0.45
export const CONTEXT_FOCUS_MIN_SPAN = 320
export const CONTEXT_FOCUS_STAGE_TOP = -40
export const CONTEXT_FOCUS_ANIM_MS = 400
/** El contenido dibujable ocupa ~85% del viewport (rango 80–90%). */
export const CLIENT_CONTENT_FILL = 0.85
/** 10% de aire en cada borde para que nada toque el marco. */
export const BUYER_FIT_EDGE_PADDING = 0.1
export const CLIENT_FIT_MAX_SCALE = 8
export const CLIENT_FIT_MIN_SCALE = 0.5

export type BuyerMapFitInset = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

/** Hueco seguro entre la top bar y la barra de pago flotantes. */
export const BUYER_FLOATING_CHROME_INSET: Required<BuyerMapFitInset> = {
  top: 104,
  right: 0,
  bottom: 176,
  left: 0,
}

function resolveBuyerFitInset(
  inset?: BuyerMapFitInset,
): Required<BuyerMapFitInset> {
  return {
    top: Math.max(0, inset?.top ?? 0),
    right: Math.max(0, inset?.right ?? 0),
    bottom: Math.max(0, inset?.bottom ?? 0),
    left: Math.max(0, inset?.left ?? 0),
  }
}

const SYNTH_PAD = 18

export function zoneCanvasAabb(zone: Pick<VenueMapZone, "polygon">): Aabb | null {
  const points = polygonToCanvas(zone.polygon)
  if (points.length < 3) return null
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

export function pointInPolygon(
  point: VenueMapPoint,
  polygon: VenueMapPoint[],
): boolean {
  return isPointInPolygon(point, polygonToCanvas(polygon))
}

function namesMatch(left: string | undefined, right: string | undefined) {
  const a = left?.trim().toLowerCase()
  const b = right?.trim().toLowerCase()
  return Boolean(a && b && a === b)
}

export function elementBelongsToZone(
  element: VenueMapElement,
  zone: VenueMapZone,
): boolean {
  const explicitZoneId = element.zoneId?.trim()
  if (explicitZoneId) return explicitZoneId === zone.id
  if (element.groupId?.trim() === zone.id) return true
  if (element.id === zone.id) return true
  if (namesMatch(element.sectorName, zone.name)) return true
  if (namesMatch(element.groupName, zone.name)) return true
  return pointInPolygon({ x: element.x, y: element.y }, zone.polygon)
}

export function seatBelongsToZone(
  seat: { x: number; y: number; sectorId: string; sectorName: string },
  zone: VenueMapZone,
): boolean {
  if (seat.sectorId === zone.id) return true
  if (namesMatch(seat.sectorName, zone.name)) return true
  return pointInPolygon({ x: seat.x, y: seat.y }, zone.polygon)
}

function aabbToPercentPolygon(box: Aabb, pad = SYNTH_PAD): VenueMapPoint[] {
  const minX = Math.max(0, box.minX - pad)
  const minY = Math.max(0, box.minY - pad)
  const maxX = Math.min(VENUE_MAP_CANVAS.width, box.maxX + pad)
  const maxY = Math.min(VENUE_MAP_CANVAS.height, box.maxY + pad)
  return [
    canvasPointToPercent({ x: minX, y: minY }),
    canvasPointToPercent({ x: maxX, y: minY }),
    canvasPointToPercent({ x: maxX, y: maxY }),
    canvasPointToPercent({ x: minX, y: maxY }),
  ]
}

/** Helper de AABB. El storefront B2C no lo usa: solo poligonos del Studio. */
export function synthesizeLodZones(map: InteractiveVenueMap): VenueMapZone[] {
  const groups = new Map<string, VenueMapElement[]>()
  for (const element of (map.elements ?? []).filter(isSellableElement)) {
    const key =
      element.groupId?.trim() ||
      element.sectorName?.trim() ||
      element.groupName?.trim() ||
      "general"
    const list = groups.get(key) ?? []
    list.push(element)
    groups.set(key, list)
  }
  if (groups.size < 2) return []
  return [...groups.entries()].flatMap(([key, members], index) => {
    const box = unionAabb(members.map(elementAabb))
    if (!box) return []
    const head = members[0]!
    return [
      {
        id: key,
        name: head.groupName?.trim() || head.sectorName?.trim() || `Sector ${index + 1}`,
        color: head.color || "#22d3ee",
        price: head.price,
        polygon: aabbToPercentPolygon(box),
        seatingType: members.every((item) => item.type === "standing_zone")
          ? ("GENERAL" as const)
          : ("RESERVED" as const),
        layoutType: members.every((item) => item.type === "standing_zone")
          ? ("general" as const)
          : ("table_combo" as const),
        sellMode: members.every((item) => item.type === "standing_zone")
          ? ("per_seat" as const)
          : ("group" as const),
        priceMode: members.every((item) => item.type === "standing_zone")
          ? ("per_person" as const)
          : ("closed_unit" as const),
        rows: 1,
        itemsPerRow: members.length,
        capacityPerUnit: 1,
        capacity: members.reduce((sum, item) => sum + (item.capacity || 1), 0),
        labelPrefix: "Mesa ",
      },
    ]
  })
}

export function resolveLodZones(map: InteractiveVenueMap): VenueMapZone[] {
  return (map.zones ?? []).filter((zone) => zone.polygon.length >= 3)
}

export function shouldEnableMapLod(map: InteractiveVenueMap): boolean {
  return resolveLodZones(map).length > 0
}

/** Dentro de una zona la foto queda de contexto, no de protagonista. */
export const MAP_BACKDROP_MICRO_OPACITY = 0.18

/**
 * Cuánto se ve la foto del predio. Al entrar a una zona **no se desmonta**: baja
 * a un fantasma y vuelve al salir, así la transición es un zoom sobre algo que
 * el comprador ya estaba mirando y no un corte a un lienzo vacío.
 *
 * El costo de rasterizar la imagen con zoom alto está acotado por el viewport
 * (el navegador solo pinta los tiles visibles), y multiplica —no pisa— la
 * opacidad que eligió el organizador en `map.backgroundOpacity`.
 */
export function mapBackdropOpacity(input: {
  lodEnabled: boolean
  viewMode: MapLodMode
}): number {
  if (!input.lodEnabled || input.viewMode === "macro") return 1
  return MAP_BACKDROP_MICRO_OPACITY
}

export function expandSelectionForContext(
  box: Aabb,
  canvas = VENUE_MAP_CANVAS,
): Aabb {
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const spanX = Math.max(CONTEXT_FOCUS_MIN_SPAN, box.maxX - box.minX)
  const spanY = Math.max(CONTEXT_FOCUS_MIN_SPAN * 0.7, box.maxY - box.minY)
  return {
    minX: Math.max(0, cx - spanX / 2),
    maxX: Math.min(canvas.width, cx + spanX / 2),
    minY: Math.min(CONTEXT_FOCUS_STAGE_TOP, cy - spanY / 2),
    maxY: Math.min(canvas.height, Math.max(box.maxY, cy + spanY / 2)),
  }
}

const SEAT_AABB_PAD = 10

/** AABB de mesas/asientos vendibles. Si no hay, usa polígonos de zona. */
export function drawableContentAabb(input: {
  elements?: readonly VenueMapElement[] | null
  seats?: ReadonlyArray<{ x: number; y: number }> | null
  zones?: readonly VenueMapZone[] | null
}): Aabb | null {
  const itemBoxes: Aabb[] = []
  for (const element of input.elements ?? []) {
    if (!isSellableElement(element)) continue
    itemBoxes.push(elementAabb(element))
  }
  for (const seat of input.seats ?? []) {
    if (!Number.isFinite(seat.x) || !Number.isFinite(seat.y)) continue
    itemBoxes.push({
      minX: seat.x - SEAT_AABB_PAD,
      minY: seat.y - SEAT_AABB_PAD,
      maxX: seat.x + SEAT_AABB_PAD,
      maxY: seat.y + SEAT_AABB_PAD,
    })
  }
  const items = unionAabb(itemBoxes)
  if (items) return items
  return unionAabb(
    (input.zones ?? [])
      .map((zone) => zoneCanvasAabb(zone))
      .filter((box): box is Aabb => box != null),
  )
}

/** ViewBox del SVG público: lienzo 800×560 más el pad del escenario. */
export const BUYER_MAP_VIEWBOX = {
  x: 0,
  y: CONTEXT_FOCUS_STAGE_TOP,
  width: VENUE_MAP_CANVAS.width,
  height: VENUE_MAP_CANVAS.height - CONTEXT_FOCUS_STAGE_TOP,
} as const

const DECORATIVE_STAGE_AABB: Aabb = {
  minX: VENUE_MAP_CANVAS.width * 0.18,
  minY: -36,
  maxX: VENUE_MAP_CANVAS.width * 0.82,
  maxY: -12,
}

const MIN_BUYER_FIT_SPAN = 80
export const BUYER_FIT_SIZE_EPSILON = 8

function rectAabb(rect: {
  x: number
  y: number
  width: number
  height: number
}): Aabb | null {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null
  }
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  }
}

function viewBoxAabb(): Aabb {
  return {
    minX: BUYER_MAP_VIEWBOX.x,
    minY: BUYER_MAP_VIEWBOX.y,
    maxX: BUYER_MAP_VIEWBOX.x + BUYER_MAP_VIEWBOX.width,
    maxY: BUYER_MAP_VIEWBOX.y + BUYER_MAP_VIEWBOX.height,
  }
}

function seatMarkerAabb(seat: { x: number; y: number }): Aabb | null {
  if (!Number.isFinite(seat.x) || !Number.isFinite(seat.y)) return null
  return {
    minX: seat.x - SEAT_AABB_PAD,
    minY: seat.y - SEAT_AABB_PAD,
    maxX: seat.x + SEAT_AABB_PAD,
    maxY: seat.y + SEAT_AABB_PAD,
  }
}

/** Unión de escenario, zonas, mesas y asientos para el auto-fit del checkout. */
export function allMapContentAabb(input: {
  elements?: readonly VenueMapElement[] | null
  seats?: ReadonlyArray<{ x: number; y: number }> | null
  zones?: readonly VenueMapZone[] | null
  stage?: { x: number; y: number; width: number; height: number } | null
  aisles?: ReadonlyArray<{
    x: number
    y: number
    width: number
    height: number
  }> | null
}): Aabb {
  const boxes: Aabb[] = [DECORATIVE_STAGE_AABB]
  const stageBox = input.stage ? rectAabb(input.stage) : null
  if (stageBox) boxes.push(stageBox)
  for (const aisle of input.aisles ?? []) {
    const box = rectAabb(aisle)
    if (box) boxes.push(box)
  }
  for (const element of input.elements ?? []) {
    boxes.push(elementAabb(element))
  }
  for (const seat of input.seats ?? []) {
    const box = seatMarkerAabb(seat)
    if (box) boxes.push(box)
  }
  for (const zone of input.zones ?? []) {
    const box = zoneCanvasAabb(zone)
    if (box) boxes.push(box)
  }
  const union = unionAabb(boxes)
  if (
    !union ||
    union.maxX - union.minX < MIN_BUYER_FIT_SPAN ||
    union.maxY - union.minY < MIN_BUYER_FIT_SPAN
  ) {
    return viewBoxAabb()
  }
  return union
}

function buyerMeetScale(wrapWidth: number, wrapHeight: number): {
  meetScale: number
  offsetX: number
  offsetY: number
} {
  const viewW = Math.max(1, wrapWidth)
  const viewH = Math.max(1, wrapHeight)
  const meetScale = Math.min(
    viewW / BUYER_MAP_VIEWBOX.width,
    viewH / BUYER_MAP_VIEWBOX.height,
  )
  return {
    meetScale,
    offsetX: (viewW - BUYER_MAP_VIEWBOX.width * meetScale) / 2,
    offsetY: (viewH - BUYER_MAP_VIEWBOX.height * meetScale) / 2,
  }
}

/**
 * Zoom-to-fit del SVG público (`preserveAspectRatio=xMidYMid meet`).
 * Escala el AABB para que quepa en el wrap con 10% de aire y centra el paneo.
 */
export function fitBuyerMapCamera(
  box: Aabb,
  wrapWidth: number,
  wrapHeight: number,
  options?: {
    padding?: number
    minScale?: number
    maxScale?: number
    inset?: BuyerMapFitInset
  },
): { scale: number; positionX: number; positionY: number } {
  const padding = options?.padding ?? BUYER_FIT_EDGE_PADDING
  const minScale = options?.minScale ?? CLIENT_FIT_MIN_SCALE
  const maxScale = options?.maxScale ?? CLIENT_FIT_MAX_SCALE
  const inset = resolveBuyerFitInset(options?.inset)
  const viewW = Math.max(1, wrapWidth)
  const viewH = Math.max(1, wrapHeight)
  const holeW = Math.max(1, viewW - inset.left - inset.right)
  const holeH = Math.max(1, viewH - inset.top - inset.bottom)
  const { meetScale, offsetX, offsetY } = buyerMeetScale(viewW, viewH)
  const width = Math.max(8, box.maxX - box.minX)
  const height = Math.max(8, box.maxY - box.minY)
  const paddedW = width * (1 + padding * 2)
  const paddedH = height * (1 + padding * 2)
  const safeMeet = Math.max(meetScale, Number.EPSILON)
  const scale = Math.min(
    maxScale,
    Math.max(
      minScale,
      Math.min(holeW / (paddedW * safeMeet), holeH / (paddedH * safeMeet)),
    ),
  )
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const screenX =
    offsetX + (cx - BUYER_MAP_VIEWBOX.x) * meetScale
  const screenY =
    offsetY + (cy - BUYER_MAP_VIEWBOX.y) * meetScale
  return {
    scale,
    positionX: inset.left + holeW / 2 - screenX * scale,
    positionY: inset.top + holeH / 2 - screenY * scale,
  }
}

export function clientFitPadding(fill = CLIENT_CONTENT_FILL): number {
  const safe = Math.min(0.9, Math.max(0.8, fill))
  return (1 / safe - 1) / 2
}

export function fitDrawableContentCamera(
  box: Aabb,
  wrapWidth: number,
  wrapHeight: number,
  fill = CLIENT_CONTENT_FILL,
): { scale: number; positionX: number; positionY: number } {
  return lodCameraTransform(box, wrapWidth, wrapHeight, {
    padding: Math.max(BUYER_FIT_EDGE_PADDING, clientFitPadding(fill)),
    minScale: CLIENT_FIT_MIN_SCALE,
    maxScale: CLIENT_FIT_MAX_SCALE,
  })
}

export function lodCameraTransform(
  box: Aabb,
  wrapWidth: number,
  wrapHeight: number,
  options?: { padding?: number; minScale?: number; maxScale?: number },
): { scale: number; positionX: number; positionY: number } {
  const padding = options?.padding ?? LOD_CAMERA_PADDING
  const minScale = options?.minScale ?? 0.5
  const maxScale = options?.maxScale ?? 5
  const width = Math.max(8, box.maxX - box.minX)
  const height = Math.max(8, box.maxY - box.minY)
  const paddedW = width * (1 + padding * 2)
  const paddedH = height * (1 + padding * 2)
  const scale = Math.min(
    maxScale,
    Math.max(
      minScale,
      Math.min(VENUE_MAP_CANVAS.width / paddedW, VENUE_MAP_CANVAS.height / paddedH),
    ),
  )
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const viewW = Math.max(1, wrapWidth)
  const viewH = Math.max(1, wrapHeight)
  return {
    scale,
    positionX: viewW / 2 - (cx / VENUE_MAP_CANVAS.width) * viewW * scale,
    positionY: viewH / 2 - (cy / VENUE_MAP_CANVAS.height) * viewH * scale,
  }
}

export function elementsInFocusedZone(
  elements: VenueMapElement[],
  zone: VenueMapZone | null,
): VenueMapElement[] {
  if (!zone) return []
  return elements.filter(
    (element) => isSellableElement(element) && elementBelongsToZone(element, zone),
  )
}

export function publicRevealElements(
  elements: VenueMapElement[] | undefined,
  zone: VenueMapZone | null,
): VenueMapElement[] {
  if (!zone) return []
  return elementsInFocusedZone(elements ?? [], zone)
}

export function publicRevealSeats<
  T extends { x: number; y: number; sectorId: string; sectorName: string },
>(seats: T[], zone: VenueMapZone | null): T[] {
  if (!zone) return []
  return seats.filter((seat) => seatBelongsToZone(seat, zone))
}

/**
 * ¿Hay algo adentro para mostrar si entramos a la zona?
 *
 * Es exactamente la cuenta que hace el render del micro, y esa es la gracia:
 * una zona puede clasificar como numerada (`hasAssignedReservedPlaces()` acepta
 * una grilla paramétrica declarada, o piezas atribuidas por `zoneId`) y no
 * tener nada que dibujar adentro. Entrar en ese caso es un zoom hacia un lienzo
 * vacío, porque el micro además apaga el fondo del plano.
 */
export function zoneHasRevealableInventory<
  T extends { x: number; y: number; sectorId: string; sectorName: string },
>(
  elements: VenueMapElement[] | undefined,
  seats: T[],
  zone: VenueMapZone | null,
): boolean {
  if (!zone) return false
  return (
    publicRevealElements(elements, zone).length > 0 ||
    publicRevealSeats(seats, zone).length > 0
  )
}

export function buyerViewportFitSessionKey(
  eventId?: string | null,
  eventDateId?: string | null,
): string {
  return `${eventId?.trim() || ""}::${eventDateId?.trim() || ""}`
}

/** Auto-fit on first macro frame, and again if the wrap size changes. */
export function shouldRunBuyerAutoFit(input: {
  sessionKey: string
  fittedSessionKey: string | null
  viewMode: MapLodMode
  wrapWidth: number
  wrapHeight: number
  fittedWidth?: number
  fittedHeight?: number
}): boolean {
  if (input.viewMode !== "macro") return false
  if (input.wrapWidth < 80 || input.wrapHeight < 80) return false
  if (input.fittedSessionKey !== input.sessionKey) return true
  if (input.fittedWidth == null || input.fittedHeight == null) return false
  return (
    Math.abs(input.fittedWidth - input.wrapWidth) > BUYER_FIT_SIZE_EPSILON ||
    Math.abs(input.fittedHeight - input.wrapHeight) > BUYER_FIT_SIZE_EPSILON
  )
}

export type BuyerMapViewport = {
  scale: number
  positionX: number
  positionY: number
}

export function buyerViewportLooksReset(current: BuyerMapViewport): boolean {
  return (
    Math.abs(current.scale - 1) < 0.02 &&
    Math.abs(current.positionX) < 2 &&
    Math.abs(current.positionY) < 2
  )
}
