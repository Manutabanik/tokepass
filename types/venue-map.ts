export type VenueMapSeatStatus = "available" | "blocked"

export type VenueMapSeat = {
  id: string
  row: string
  number: number
  x: number
  y: number
  status: VenueMapSeatStatus
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
  capacity: number
  seats: VenueMapElementSeat[]
  groupId?: string
  groupName?: string
  ringIndex?: number
}

export type VenueMapPoint = { x: number; y: number }

export type VenueZoneLayoutType = "general" | "table_combo" | "numbered_seat"

/** Polígono paramétrico para festivales (generación masiva de inventario). */
export type VenueMapZone = {
  id: string
  name: string
  color: string
  price: number
  polygon: VenueMapPoint[]
  layoutType: VenueZoneLayoutType
  sellMode: VenueSellMode
  rows: number
  itemsPerRow: number
  capacityPerUnit: number
  capacity: number
  labelPrefix: string
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
        ? item.seats.map((seat, index) => ({
            id: String(seat.id ?? `${item.id}-S${index + 1}`),
            number: asNumber(seat.number, index + 1),
            x: asNumber(seat.x, 0),
            y: asNumber(seat.y, 0),
            status: (seat.status === "blocked" ? "blocked" : "available") as
              | "blocked"
              | "available",
          }))
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
    sellMode:
      layer === "infrastructure"
        ? "per_seat"
        : item.sellMode === "group" || item.sell_mode === "group"
          ? "group"
          : "per_seat",
    capacity:
      layer === "infrastructure" ? 0 : Math.max(0, asNumber(item.capacity, 0)),
    seats,
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

function parseVenueZone(raw: unknown): VenueMapZone | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const polygon = Array.isArray(item.polygon)
    ? item.polygon.map(parseMapPoint).filter((point): point is VenueMapPoint => Boolean(point))
    : []
  if (polygon.length < 3) return null
  const layoutRaw = String(item.layoutType ?? item.layout_type ?? "table_combo")
  const layoutType: VenueZoneLayoutType =
    layoutRaw === "general" || layoutRaw === "numbered_seat"
      ? layoutRaw
      : "table_combo"
  const rows = Math.min(80, Math.max(1, asNumber(item.rows, 4)))
  const itemsPerRow = Math.min(80, Math.max(1, asNumber(item.itemsPerRow ?? item.items_per_row, 10)))
  return {
    id: String(item.id ?? `zone-${Math.random().toString(36).slice(2, 8)}`),
    name: String(item.name ?? "Zona").slice(0, 80),
    color: String(item.color ?? "#22d3ee"),
    price: Math.max(0, asNumber(item.price, 0)),
    polygon: polygonToPercent(polygon),
    layoutType,
    sellMode: item.sellMode === "per_seat" || item.sell_mode === "per_seat" ? "per_seat" : "group",
    rows,
    itemsPerRow,
    capacityPerUnit: Math.min(100, Math.max(1, asNumber(item.capacityPerUnit ?? item.capacity_per_unit, 1))),
    capacity: Math.max(0, asNumber(item.capacity, rows * itemsPerRow)),
    labelPrefix: String(item.labelPrefix ?? item.label_prefix ?? (layoutType === "numbered_seat" ? "Butaca " : "Mesa ")).slice(0, 24),
  }
}

function parsePolygonSector(raw: unknown): VenueMapSector | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Partial<VenueMapSector>
  if (!Array.isArray(item.seats)) return null
  if (!item.id || !item.name) return null
  return item as VenueMapSector
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

export function parseVenueMap(raw: unknown): InteractiveVenueMap {
  if (!raw || typeof raw !== "object") return emptyVenueMap()
  const record = raw as Record<string, unknown>
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
      capacity: 0,
      seats: [] as VenueMapElement["seats"],
    }
  })
  return JSON.parse(
    JSON.stringify({ ...map, elements }),
  ) as InteractiveVenueMap
}
