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

export type VenueInfraSubtype =
  | "stage"
  | "dj_booth"
  | "bar"
  | "restroom"
  | "entrance"
  | "exit"

export type VenueSellMode = "per_seat" | "group"

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
  category: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  price: number
  color: string
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

export type InteractiveVenueMap = {
  version: 1
  stage: VenueMapStage | null
  labels: VenueMapLabel[]
  aisles: VenueMapAisle[]
  sectors: VenueMapSector[]
  elements: VenueMapElement[]
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
    typeof raw.backgroundImage === "string" ||
    typeof raw.background_image === "string"
  )
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseElement(raw: unknown): VenueMapElement | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Partial<VenueMapElement>
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
  const seats = Array.isArray(item.seats)
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
    type,
    subtype: item.subtype,
    label: String(item.label ?? "Elemento"),
    category: String(item.category ?? "General"),
    x: asNumber(item.x, 200),
    y: asNumber(item.y, 160),
    width: asNumber(item.width, 80),
    height: asNumber(item.height, 80),
    rotation: asNumber(item.rotation, 0),
    price: Math.max(0, asNumber(item.price, 0)),
    color: String(item.color ?? "#f97316"),
    chairCount: asNumber(item.chairCount, 8),
    sideA: asNumber(item.sideA, 4),
    sideB: asNumber(item.sideB, 4),
    sellMode:
      item.sellMode === "group" ||
      (item as Record<string, unknown>).sell_mode === "group"
        ? "group"
        : "per_seat",
    capacity: Math.max(0, asNumber(item.capacity, 0)),
    seats,
    groupId: textOrUndefined(item.groupId ?? (item as Record<string, unknown>).group_id),
    groupName: textOrUndefined(
      item.groupName ?? (item as Record<string, unknown>).group_name,
    ),
    ringIndex: parseOptionalInt(
      item.ringIndex ?? (item as Record<string, unknown>).ring_index,
    ),
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

export function isSellableElement(element: VenueMapElement): boolean {
  return element.type !== "infrastructure"
}

export function serializeVenueMap(map: InteractiveVenueMap): InteractiveVenueMap {
  return JSON.parse(JSON.stringify(map)) as InteractiveVenueMap
}
