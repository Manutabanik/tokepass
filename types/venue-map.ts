export type VenueMapSeatStatus = "available" | "blocked" | "reserved"

export type VenueMapSeat = {
  id: string
  row: string
  number: number
  x: number
  y: number
  status: VenueMapSeatStatus
  label?: string
  price?: number
  rotation?: number
}

export type VenueMapSector = {
  id: string
  name: string
  color: string
  price: number
  x: number
  y: number
  rows: number
  seatsPerRow: number
  curvature: number
  aisle: boolean
  seats: VenueMapSeat[]
}

export type VenueMapStage = {
  label: string
  x: number
  y: number
  width: number
  height: number
}

export type VenueMapLabel = {
  id: string
  text: string
  x: number
  y: number
  color: string
}

export type VenueMapAisle = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type VenueElementType =
  | "vip_chair"
  | "round_table"
  | "long_table"
  | "vip_box"
  | "standing_zone"
  | "infrastructure"

export type VenueMapLayer = "commercial" | "infrastructure"

export type VenueInfraSubtype =
  | "stage"
  | "dj_booth"
  | "bar"
  | "restroom"
  | "entrance"
  | "exit"
  | "parking"
  | "kitchen"

export type VenueSellMode = "per_seat" | "group"

/** How `price` is interpreted on a SKU/map unit. Kept in lockstep with `sellMode`. */
export type VenuePriceMode = "closed_unit" | "per_person"

export function venuePriceModeFromSellMode(sellMode: VenueSellMode): VenuePriceMode {
  return sellMode === "group" ? "closed_unit" : "per_person"
}

export function venueSellModeFromPriceMode(priceMode: VenuePriceMode): VenueSellMode {
  return priceMode === "closed_unit" ? "group" : "per_seat"
}

export function resolveVenuePricing(input: {
  sellMode?: unknown
  priceMode?: unknown
  fallback?: VenueSellMode
}): { sellMode: VenueSellMode; priceMode: VenuePriceMode } {
  const priceRaw = String(input.priceMode ?? "")
  if (priceRaw === "closed_unit" || priceRaw === "per_person") {
    return {
      priceMode: priceRaw,
      sellMode: venueSellModeFromPriceMode(priceRaw),
    }
  }
  const sellRaw = String(input.sellMode ?? "")
  if (sellRaw === "group" || sellRaw === "per_seat") {
    return {
      sellMode: sellRaw,
      priceMode: venuePriceModeFromSellMode(sellRaw),
    }
  }
  const fallback = input.fallback === "group" ? "group" : "per_seat"
  return {
    sellMode: fallback,
    priceMode: venuePriceModeFromSellMode(fallback),
  }
}

export function venueUnitPriceLabel(input: {
  type?: string | null
  layoutType?: string | null
  sellMode?: VenueSellMode | null
  priceMode?: VenuePriceMode | null
}): string {
  const closed =
    input.priceMode === "closed_unit" || input.sellMode === "group"
  if (input.layoutType === "numbered_seat" || input.type === "vip_chair") {
    return "Precio por butaca"
  }
  if (input.layoutType === "general" || input.type === "standing_zone") {
    return "Precio por persona"
  }
  if (input.type === "vip_box") {
    return closed ? "Precio total del palco" : "Precio por silla"
  }
  if (
    input.type === "round_table" ||
    input.type === "long_table" ||
    input.layoutType === "table_combo"
  ) {
    return closed ? "Precio total de la mesa" : "Precio por silla"
  }
  return closed ? "Precio total de la unidad" : "Precio por persona"
}

export type VenueShapeType =
  | "theatre_seat"
  | "round_table"
  | "long_table"
  | "vip_box"
  | "standing_zone"
  | "infra_stage"
  | "infra_bar"
  | "infra_restroom"
  | "infra_door"
  | "infra_generic"

export type VenueMapElementSeat = {
  id: string
  number: number
  x: number
  y: number
  status: VenueMapSeatStatus
  label?: string
  row?: string
  price?: number
  rotation?: number
}

export type VenueMapElement = {
  id: string
  type: VenueElementType
  subtype?: VenueInfraSubtype
  label: string
  /** Capa: comercial (vendible) o referencia visual. */
  category: VenueMapLayer
  /** Nombre de sector comercial (VIP, Platea). Vacío en infraestructura. */
  sectorName: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** Silueta vectorial independiente del tipo comercial. */
  shapeType?: VenueShapeType
  /** Radio de curvatura de esquinas (tablón, box, infraestructura). */
  roundedCorner?: number
  /** Solo comercial. Infraestructura no se cobra. */
  price: number
  color: string
  opacity: number
  chairCount: number
  sideA: number
  sideB: number
  sellMode: VenueSellMode
  /** Explicit price semantics. `closed_unit` <=> `sellMode: "group"`. */
  priceMode?: VenuePriceMode
  capacity: number
  seats: VenueMapElementSeat[]
  /** Zona contenedora (drill-down / aislamiento). */
  zoneId?: string
  groupId?: string
  groupName?: string
  ringIndex?: number
  /** When true, bulk numbering leaves this label untouched. */
  labelLocked?: boolean
  /** When true, drag / resize / rotate are disabled. */
  isLocked?: boolean
}

export type VenueMapPoint = { x: number; y: number }

export type VenueZoneLayoutType = "general" | "table_combo" | "numbered_seat"

/** Polígono paramétrico. El JSON también acepta `points` o `x,y,width,height`. */
export type VenueMapZone = {
  id: string
  name: string
  color: string
  price: number
  polygon: VenueMapPoint[]
  layoutType: VenueZoneLayoutType
  sellMode: VenueSellMode
  /** Explicit price semantics. `closed_unit` <=> `sellMode: "group"`. */
  priceMode?: VenuePriceMode
  rows: number
  itemsPerRow: number
  capacityPerUnit: number
  capacity: number
  labelPrefix: string
  /** Reserved seats/tables already include venue (GA) access. */
  includesGeneralAccess?: boolean
}

export type InteractiveVenueMap = {
  version: 1
  stage: VenueMapStage | null
  labels: VenueMapLabel[]
  aisles: VenueMapAisle[]
  sectors: VenueMapSector[]
  elements: VenueMapElement[]
  zones: VenueMapZone[]
  backgroundImage: string | null
  backgroundOpacity: number
  backgroundScale: number
  backgroundX: number
  backgroundY: number
}

export function emptyVenueMap(): InteractiveVenueMap {
  return {
    version: 1,
    stage: {
      label: "ESCENARIO",
      x: 200,
      y: 24,
      width: 400,
      height: 48,
    },
    labels: [],
    aisles: [],
    sectors: [],
    elements: [],
    zones: [],
    backgroundImage: null,
    backgroundOpacity: 0.4,
    backgroundScale: 1,
    backgroundX: 0,
    backgroundY: 0,
  }
}

export function isInteractiveVenueMap(
  value: unknown,
): value is InteractiveVenueMap {
  if (!value || typeof value !== "object") return false
  const raw = value as Record<string, unknown>
  return (
    Array.isArray(raw.sectors) ||
    Array.isArray(raw.elements) ||
    Array.isArray(raw.zones) ||
    typeof raw.backgroundImage === "string" ||
    typeof raw.background_image === "string"
  )
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const MAP_CANVAS = { width: 800, height: 560 }

function polygonToPercent(points: VenueMapPoint[]): VenueMapPoint[] {
  if (!points.some((point) => point.x > 100.0001 || point.y > 100.0001)) {
    return points
  }
  return points.map((point) => ({
    x: Math.round((point.x / MAP_CANVAS.width) * 100000) / 1000,
    y: Math.round((point.y / MAP_CANVAS.height) * 100000) / 1000,
  }))
}

const VENUE_SHAPE_TYPES: VenueShapeType[] = [
  "theatre_seat",
  "round_table",
  "long_table",
  "vip_box",
  "standing_zone",
  "infra_stage",
  "infra_bar",
  "infra_restroom",
  "infra_door",
  "infra_generic",
]

function parseSeatStatus(value: unknown): VenueMapSeatStatus {
  if (value === "reserved") return "reserved"
  if (value === "blocked" || value === "disabled" || value === "inactive") {
    return "blocked"
  }
  return "available"
}

function parseOptionalSeatNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return n
}

function parseShapeType(value: unknown): VenueShapeType | undefined {
  if (typeof value !== "string") return undefined
  return VENUE_SHAPE_TYPES.includes(value as VenueShapeType)
    ? (value as VenueShapeType)
    : undefined
}

function defaultElementSize(type: VenueElementType): { width: number; height: number } {
  if (type === "vip_chair") return { width: 12, height: 12 }
  if (type === "round_table") return { width: 28, height: 28 }
  if (type === "long_table") return { width: 60, height: 20 }
  if (type === "vip_box") return { width: 88, height: 56 }
  if (type === "standing_zone") return { width: 160, height: 100 }
  return { width: 80, height: 48 }
}

function resolveLayer(
  type: VenueElementType,
  rawCategory: unknown,
): VenueMapLayer {
  if (type === "infrastructure") return "infrastructure"
  if (rawCategory === "infrastructure" || rawCategory === "Infraestructura") {
    return "infrastructure"
  }
  return "commercial"
}

function resolveSectorName(
  layer: VenueMapLayer,
  item: Record<string, unknown>,
): string {
  if (layer === "infrastructure") return ""
  const explicit = textOrUndefined(item.sectorName ?? item.sector_name)
  if (explicit) return explicit
  const legacy = textOrUndefined(item.category)
  if (
    legacy &&
    legacy !== "commercial" &&
    legacy !== "infrastructure" &&
    legacy !== "Infraestructura"
  ) {
    return legacy
  }
  return textOrUndefined(item.groupName ?? item.group_name) ?? "General"
}

function parseElement(raw: unknown): VenueMapElement | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Partial<VenueMapElement> & Record<string, unknown>
  const type = item.type
  if (
    type !== "vip_chair" &&
    type !== "round_table" &&
    type !== "long_table" &&
    type !== "vip_box" &&
    type !== "standing_zone" &&
    type !== "infrastructure"
  ) {
    return null
  }
  const layer = resolveLayer(type, item.category)
  const seats =
    layer === "infrastructure"
      ? []
      : Array.isArray(item.seats)
        ? item.seats.map((seat, index) => {
            const price = parseOptionalSeatNumber(seat.price)
            const rotation = parseOptionalSeatNumber(seat.rotation)
            return {
              id: String(seat.id ?? `${item.id}-S${index + 1}`),
              number: asNumber(seat.number, index + 1),
              x: asNumber(seat.x, 0),
              y: asNumber(seat.y, 0),
              status: parseSeatStatus(seat.status),
              ...(typeof seat.label === "string" && seat.label.trim()
                ? { label: seat.label.trim().slice(0, 40) }
                : {}),
              ...(typeof seat.row === "string" && seat.row.trim()
                ? { row: seat.row.trim().slice(0, 24) }
                : {}),
              ...(price != null ? { price: Math.max(0, price) } : {}),
              ...(rotation != null ? { rotation } : {}),
            }
          })
        : []
  return {
    id: String(item.id ?? `el-${Math.random().toString(36).slice(2, 8)}`),
    type: layer === "infrastructure" ? "infrastructure" : type,
    subtype: item.subtype,
    label: String(item.label ?? "Elemento"),
    category: layer,
    sectorName: resolveSectorName(layer, item),
    x: asNumber(item.x, 200),
    y: asNumber(item.y, 160),
    width: asNumber(item.width, defaultElementSize(type).width),
    height: asNumber(item.height, defaultElementSize(type).height),
    rotation: asNumber(item.rotation, 0),
    shapeType: parseShapeType(item.shapeType ?? item.shape_type),
    roundedCorner:
      item.roundedCorner != null || item.rounded_corner != null
        ? Math.max(0, Math.min(24, asNumber(item.roundedCorner ?? item.rounded_corner, 4)))
        : undefined,
    price: layer === "infrastructure" ? 0 : Math.max(0, asNumber(item.price, 0)),
    color: String(
      item.color ?? (layer === "infrastructure" ? "#a1a1aa" : "#f97316"),
    ),
    opacity: asOpacity(item.opacity, layer === "infrastructure" ? 0.92 : 1),
    chairCount: asNumber(item.chairCount, 8),
    sideA: asNumber(item.sideA, 4),
    sideB: asNumber(item.sideB, 4),
    ...(layer === "infrastructure"
      ? { sellMode: "per_seat" as const, priceMode: "per_person" as const }
      : resolveVenuePricing({
          sellMode: item.sellMode ?? item.sell_mode,
          priceMode: item.priceMode ?? item.price_mode,
          fallback: "per_seat",
        })),
    capacity:
      layer === "infrastructure" ? 0 : Math.max(0, asNumber(item.capacity, 0)),
    seats,
    zoneId: textOrUndefined(item.zoneId ?? item.zone_id ?? item.parentId),
    groupId:
      layer === "infrastructure"
        ? undefined
        : textOrUndefined(item.groupId ?? item.group_id),
    groupName:
      layer === "infrastructure"
        ? undefined
        : textOrUndefined(item.groupName ?? item.group_name),
    ringIndex:
      layer === "infrastructure"
        ? undefined
        : parseOptionalInt(item.ringIndex ?? item.ring_index),
    ...(parseOptionalBoolean(item.labelLocked ?? item.label_locked)
      ? { labelLocked: true as const }
      : {}),
    ...(parseOptionalBoolean(item.isLocked ?? item.is_locked)
      ? { isLocked: true as const }
      : {}),
  }
}

function textOrUndefined(value: unknown, max = 80): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function parseOptionalInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.round(value)
}

function parseMapPoint(raw: unknown): VenueMapPoint | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const x = Number(item.x)
  const y = Number(item.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
}

function rectToPolygon(item: Record<string, unknown>): VenueMapPoint[] {
  const x = Number(item.x)
  const y = Number(item.y)
  const width = Number(item.width)
  const height = Number(item.height)
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return []
  }
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]
}

function parseVenueZone(raw: unknown): VenueMapZone | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const rawPoints = Array.isArray(item.polygon)
    ? item.polygon
    : Array.isArray(item.points)
      ? item.points
      : []
  const fromPoints = rawPoints
    .map(parseMapPoint)
    .filter((point): point is VenueMapPoint => Boolean(point))
  const polygon = fromPoints.length >= 3 ? fromPoints : rectToPolygon(item)
  if (polygon.length < 3) return null
  const layoutRaw = String(item.layoutType ?? item.layout_type ?? "table_combo")
  const layoutType: VenueZoneLayoutType =
    layoutRaw === "general" || layoutRaw === "numbered_seat"
      ? layoutRaw
      : "table_combo"
  const rows = Math.min(80, Math.max(1, asNumber(item.rows, 4)))
  const itemsPerRow = Math.min(80, Math.max(1, asNumber(item.itemsPerRow ?? item.items_per_row, 10)))
  const pricing =
    layoutType === "numbered_seat"
      ? { sellMode: "per_seat" as const, priceMode: "per_person" as const }
      : resolveVenuePricing({
          sellMode: item.sellMode ?? item.sell_mode,
          priceMode: item.priceMode ?? item.price_mode,
          fallback: layoutType === "table_combo" ? "group" : "group",
        })
  return {
    id: String(item.id ?? `zone-${Math.random().toString(36).slice(2, 8)}`),
    name: String(item.name ?? "Zona").slice(0, 80),
    color: String(item.color ?? "#22d3ee"),
    price: Math.max(0, asNumber(item.price, 0)),
    polygon: polygonToPercent(polygon),
    layoutType,
    sellMode: pricing.sellMode,
    priceMode: pricing.priceMode,
    rows,
    itemsPerRow,
    capacityPerUnit: Math.min(100, Math.max(1, asNumber(item.capacityPerUnit ?? item.capacity_per_unit, 1))),
    capacity: Math.max(0, asNumber(item.capacity, rows * itemsPerRow)),
    labelPrefix: String(item.labelPrefix ?? item.label_prefix ?? (layoutType === "numbered_seat" ? "Butaca " : "Mesa ")).slice(0, 24),
    includesGeneralAccess: parseOptionalBoolean(
      item.includesGeneralAccess ?? item.includes_general_access,
    ),
  }
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (value === "true" || value === 1 || value === "1") return true
  if (value === "false" || value === 0 || value === "0") return false
  return undefined
}

export function zoneIncludesGeneralAccess(
  zone: Pick<VenueMapZone, "includesGeneralAccess" | "layoutType">,
): boolean {
  if (typeof zone.includesGeneralAccess === "boolean") {
    return zone.includesGeneralAccess
  }
  return zone.layoutType === "table_combo" || zone.layoutType === "numbered_seat"
}

export function mapIncludesGeneralAccess(
  map: InteractiveVenueMap | null | undefined,
): boolean {
  const zones = map?.zones ?? []
  if (zones.length === 0) return true
  return zones.some(zoneIncludesGeneralAccess)
}

function parsePolygonSector(raw: unknown): VenueMapSector | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  if (!Array.isArray(item.seats)) return null
  const id =
    String(item.id ?? "").trim() ||
    `sector-${Math.random().toString(36).slice(2, 10)}`
  const name = String(item.name ?? "").trim() || "Sector"
  const seats = item.seats.map((seat, index) => {
    const row = seat && typeof seat === "object" ? (seat as Record<string, unknown>) : {}
    const price = parseOptionalSeatNumber(row.price)
    const rotation = parseOptionalSeatNumber(row.rotation)
    const parsed: VenueMapSeat = {
      id: String(row.id ?? `${id}-S${index + 1}`),
      row: String(row.row ?? "1"),
      number: asNumber(row.number, index + 1),
      x: asNumber(row.x, 0),
      y: asNumber(row.y, 0),
      status: parseSeatStatus(row.status),
    }
    if (typeof row.label === "string" && row.label.trim()) {
      parsed.label = row.label.trim().slice(0, 40)
    }
    if (price != null) parsed.price = Math.max(0, price)
    if (rotation != null) parsed.rotation = rotation
    return parsed
  })
  return {
    id,
    name,
    color: String(item.color ?? "#f97316"),
    price: Math.max(0, asNumber(item.price, 0)),
    x: asNumber(item.x, 0),
    y: asNumber(item.y, 0),
    rows: Math.max(1, asNumber(item.rows, 1)),
    seatsPerRow: Math.max(1, asNumber(item.seatsPerRow ?? item.seats_per_row, 1)),
    curvature: Math.min(1, Math.max(0, asNumber(item.curvature, 0))),
    aisle: Boolean(item.aisle),
    seats,
  }
}

function flattenNestedSectorElements(raw: unknown): VenueMapElement[] {
  if (!Array.isArray(raw)) return []
  const out: VenueMapElement[] = []
  for (const sector of raw) {
    if (!sector || typeof sector !== "object") continue
    const record = sector as Record<string, unknown>
    if (!Array.isArray(record.elements)) continue
    const groupId = textOrUndefined(record.id)
    const groupName = textOrUndefined(record.name ?? record.sector_name)
    const color =
      typeof record.color === "string" ? record.color : undefined
    for (const nested of record.elements) {
      const parsed = parseElement(nested)
      if (!parsed) continue
      out.push({
        ...parsed,
        groupId: parsed.groupId || groupId,
        groupName: parsed.groupName || groupName,
        color: parsed.color || color || parsed.color,
      })
    }
  }
  return out
}

function asOpacity(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function unwrapVenueMapRecord(raw: unknown): Record<string, unknown> | null {
  let current: unknown = raw
  if (typeof current === "string") {
    const trimmed = current.trim()
    if (!trimmed) return null
    try {
      current = JSON.parse(trimmed) as unknown
    } catch {
      return null
    }
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return null
  }
  const record = current as Record<string, unknown>
  const looksLikeMap =
    Array.isArray(record.sectors) ||
    Array.isArray(record.elements) ||
    Array.isArray(record.zones) ||
    typeof record.backgroundImage === "string" ||
    typeof record.background_image === "string"
  if (looksLikeMap) return record
  const nested =
    record.layout ??
    record.map ??
    record.venue_map ??
    record.venueMap ??
    record.data
  if (nested && nested !== current) return unwrapVenueMapRecord(nested)
  return record
}

export function parseVenueMap(raw: unknown): InteractiveVenueMap {
  const record = unwrapVenueMapRecord(raw)
  if (!record) return emptyVenueMap()
  if (
    !Array.isArray(record.sectors) &&
    !Array.isArray(record.elements) &&
    !Array.isArray(record.zones) &&
    typeof record.backgroundImage !== "string" &&
    typeof record.background_image !== "string"
  ) {
    return emptyVenueMap()
  }

  const topElements = Array.isArray(record.elements)
    ? record.elements
        .map((element) => parseElement(element))
        .filter((element): element is VenueMapElement => Boolean(element))
    : []
  const nested = flattenNestedSectorElements(record.sectors)
  const seen = new Set(topElements.map((element) => element.id))
  const elements = [
    ...topElements,
    ...nested.filter((element) => {
      if (seen.has(element.id)) return false
      seen.add(element.id)
      return true
    }),
  ]

  const scale = Number(record.backgroundScale ?? record.background_scale ?? 1)

  return {
    version: 1,
    stage: (record.stage as InteractiveVenueMap["stage"]) ?? null,
    labels: Array.isArray(record.labels)
      ? (record.labels as InteractiveVenueMap["labels"])
      : [],
    aisles: Array.isArray(record.aisles)
      ? (record.aisles as InteractiveVenueMap["aisles"])
      : [],
    sectors: Array.isArray(record.sectors)
      ? record.sectors
          .map((sector) => parsePolygonSector(sector))
          .filter((sector): sector is VenueMapSector => Boolean(sector))
      : [],
    elements,
    zones: Array.isArray(record.zones)
      ? record.zones
          .map((zone) => parseVenueZone(zone))
          .filter((zone): zone is VenueMapZone => Boolean(zone))
      : [],
    backgroundImage:
      textOrUndefined(record.backgroundImage ?? record.background_image, 2000) ??
      null,
    backgroundOpacity: asOpacity(
      record.backgroundOpacity ?? record.background_opacity,
      0.4,
    ),
    backgroundScale: Number.isFinite(scale)
      ? Math.min(4, Math.max(0.2, scale))
      : 1,
    backgroundX: asNumber(record.backgroundX ?? record.background_x, 0),
    backgroundY: asNumber(record.backgroundY ?? record.background_y, 0),
  }
}

export function isInfrastructureElement(element: VenueMapElement): boolean {
  return (
    element.category === "infrastructure" || element.type === "infrastructure"
  )
}

export function isSellableElement(element: VenueMapElement): boolean {
  return !isInfrastructureElement(element)
}

export function serializeVenueMap(map: InteractiveVenueMap): InteractiveVenueMap {
  const elements = (map.elements ?? []).map((element) => {
    if (!isInfrastructureElement(element)) {
      return {
        ...element,
        category: "commercial" as const,
        sectorName: element.sectorName || element.groupName || "General",
      }
    }
    return {
      id: element.id,
      type: "infrastructure" as const,
      subtype: element.subtype,
      label: element.label,
      category: "infrastructure" as const,
      sectorName: "",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      shapeType: element.shapeType,
      roundedCorner: element.roundedCorner,
      price: 0,
      color: element.color,
      opacity: element.opacity,
      chairCount: 0,
      sideA: 0,
      sideB: 0,
      sellMode: "per_seat" as const,
      priceMode: "per_person" as const,
      capacity: 0,
      seats: [] as VenueMapElement["seats"],
    }
  })
  return JSON.parse(
    JSON.stringify({ ...map, elements }),
  ) as InteractiveVenueMap
}
