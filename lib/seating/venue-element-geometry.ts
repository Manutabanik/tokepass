import type {
  VenueMapElement,
  VenueMapElementSeat,
  VenueElementType,
  VenueInfraSubtype,
  VenueMapSector,
  VenueShapeType,
} from "@/types/venue-map"

const ZONE_COLORS = ["#f97316", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#06b6d4"]

export const VENUE_SHAPE = {
  roundTableRadius: 14,
  longTableWidth: 60,
  longTableHeight: 20,
  chairRadius: 3,
  vipChairRadius: 6,
  theatreSeat: 12,
  roundTableChairOrbit: 19,
} as const

export function defaultVenueShapeType(
  element: Pick<VenueMapElement, "type" | "subtype">,
): VenueShapeType {
  if (element.type === "vip_chair") return "theatre_seat"
  if (element.type === "round_table") return "round_table"
  if (element.type === "long_table") return "long_table"
  if (element.type === "vip_box") return "vip_box"
  if (element.type === "standing_zone") return "standing_zone"
  if (element.subtype === "bar" || element.subtype === "kitchen") return "infra_bar"
  if (element.subtype === "restroom") return "infra_restroom"
  if (element.subtype === "entrance" || element.subtype === "exit") return "infra_door"
  if (element.subtype === "stage" || element.subtype === "dj_booth") return "infra_stage"
  return "infra_generic"
}

export function resolveVenueShapeType(element: VenueMapElement): VenueShapeType {
  return element.shapeType ?? defaultVenueShapeType(element)
}

export function compactVenueElementLabel(label: string, zoom: number): string {
  if (zoom >= 1.2) return label
  const match = /(\d+)\s*$/.exec(label)
  if (!match) return label
  return String(Number(match[1]))
}

export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  const dx = x - cx
  const dy = y - cy
  return {
    x: Math.round((cx + dx * Math.cos(rad) - dy * Math.sin(rad)) * 10) / 10,
    y: Math.round((cy + dx * Math.sin(rad) + dy * Math.cos(rad)) * 10) / 10,
  }
}

function seat(
  id: string,
  number: number,
  x: number,
  y: number,
): VenueMapElementSeat {
  return { id, number, x, y, status: "available" }
}

export function rebuildElementSeats(element: VenueMapElement): VenueMapElementSeat[] {
  const prefix = element.id
  if (element.type === "infrastructure" || element.type === "standing_zone") {
    return []
  }
  if (element.type === "vip_chair") {
    return [seat(`${prefix}-S1`, 1, element.x, element.y)]
  }
  if (element.type === "round_table") {
    const count = Math.min(12, Math.max(2, Math.floor(element.chairCount) || 8))
    const tableRadius = Math.max(
      8,
      Math.min(element.width || 28, element.height || 28) / 2,
    )
    const radius = tableRadius + VENUE_SHAPE.chairRadius + 2
    const seats: VenueMapElementSeat[] = []
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + (element.rotation * Math.PI) / 180
      seats.push(
        seat(
          `${prefix}-S${index + 1}`,
          index + 1,
          Math.round((element.x + Math.cos(angle) * radius) * 10) / 10,
          Math.round((element.y + Math.sin(angle) * radius) * 10) / 10,
        ),
      )
    }
    return seats
  }
  if (element.type === "long_table") {
    const sideA = Math.min(12, Math.max(1, Math.floor(element.sideA) || 4))
    const sideB = Math.min(12, Math.max(0, Math.floor(element.sideB) || 4))
    const width = Math.max(8, element.width || VENUE_SHAPE.longTableWidth)
    const height = Math.max(8, element.height || VENUE_SHAPE.longTableHeight)
    const inset = 8
    const chairOffset = height / 2 + VENUE_SHAPE.chairRadius + 2
    const seats: VenueMapElementSeat[] = []
    let number = 1
    for (let index = 0; index < sideA; index += 1) {
      const t = sideA === 1 ? 0.5 : index / (sideA - 1)
      const local = rotatePoint(
        element.x - width / 2 + inset + t * (width - inset * 2),
        element.y - chairOffset,
        element.x,
        element.y,
        element.rotation,
      )
      seats.push(seat(`${prefix}-S${number}`, number, local.x, local.y))
      number += 1
    }
    for (let index = 0; index < sideB; index += 1) {
      const t = sideB === 1 ? 0.5 : index / (sideB - 1)
      const local = rotatePoint(
        element.x - width / 2 + inset + t * (width - inset * 2),
        element.y + chairOffset,
        element.x,
        element.y,
        element.rotation,
      )
      seats.push(seat(`${prefix}-S${number}`, number, local.x, local.y))
      number += 1
    }
    return seats
  }
  if (element.type === "vip_box") {
    const count = Math.min(12, Math.max(2, Math.floor(element.chairCount) || 6))
    const cols = Math.ceil(count / 2)
    const seats: VenueMapElementSeat[] = []
    for (let index = 0; index < count; index += 1) {
      const col = index % cols
      const row = Math.floor(index / cols)
      const local = rotatePoint(
        element.x - (cols - 1) * 8 + col * 16,
        element.y - 10 + row * 18,
        element.x,
        element.y,
        element.rotation,
      )
      seats.push(seat(`${prefix}-S${index + 1}`, index + 1, local.x, local.y))
    }
    return seats
  }
  return []
}

export function createVenueElement(
  type: VenueElementType,
  index: number,
  point: { x: number; y: number },
  subtype?: VenueInfraSubtype,
  extras?: { zoneId?: string },
): VenueMapElement {
  const color = ZONE_COLORS[index % ZONE_COLORS.length]!
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
  const base: VenueMapElement = {
    id,
    type,
    subtype,
    label: defaultLabel(type, index, subtype),
    category: type === "infrastructure" ? "infrastructure" : "commercial",
    sectorName: defaultSectorName(type),
    x: point.x,
    y: point.y,
    width: type === "round_table" ? VENUE_SHAPE.roundTableRadius * 2 : 80,
    height: type === "round_table" ? VENUE_SHAPE.roundTableRadius * 2 : 48,
    rotation: 0,
    shapeType: defaultVenueShapeType({ type, subtype }),
    roundedCorner: type === "vip_box" ? 6 : 4,
    price: 0,
    color,
    opacity: type === "infrastructure" ? 0.92 : 1,
    chairCount: type === "round_table" ? 8 : 6,
    sideA: 4,
    sideB: 4,
    sellMode: type === "vip_box" ? "group" : "per_seat",
    priceMode: type === "vip_box" ? "closed_unit" : "per_person",
    capacity: type === "standing_zone" ? 80 : 0,
    seats: [],
    ...(extras?.zoneId?.trim() ? { zoneId: extras.zoneId.trim() } : {}),
  }
  if (type === "standing_zone") {
    base.width = 160
    base.height = 100
    base.color = "#10b981"
  }
  if (type === "vip_chair") {
    base.width = VENUE_SHAPE.theatreSeat
    base.height = VENUE_SHAPE.theatreSeat
    base.roundedCorner = 2
  }
  if (type === "long_table") {
    base.width = VENUE_SHAPE.longTableWidth
    base.height = VENUE_SHAPE.longTableHeight
  }
  if (type === "vip_box") {
    base.width = 88
    base.height = 56
    base.color = "#a855f7"
  }
  if (type === "infrastructure") {
    base.width = subtype === "stage" || subtype === "dj_booth" ? 280 : 72
    base.height = subtype === "stage" || subtype === "dj_booth" ? 48 : 40
    if (subtype === "parking") {
      base.width = 96
      base.height = 56
    }
    if (subtype === "kitchen") {
      base.width = 88
      base.height = 48
    }
    base.color = "#a1a1aa"
    base.seats = []
    return base
  }
  base.seats = rebuildElementSeats(base)
  return base
}

function defaultLabel(
  type: VenueElementType,
  index: number,
  subtype?: VenueInfraSubtype,
): string {
  if (type === "vip_chair") return `Silla VIP ${index + 1}`
  if (type === "round_table") return `Mesa ${index + 1}`
  if (type === "long_table") return `Tablón ${String.fromCharCode(65 + (index % 26))}`
  if (type === "vip_box") return `Box VIP ${index + 1}`
  if (type === "standing_zone") return `Campo ${index + 1}`
  if (subtype === "dj_booth") return "DJ BOOTH"
  if (subtype === "bar") return "BARRA"
  if (subtype === "restroom") return "BAÑOS"
  if (subtype === "entrance") return "ENTRADA"
  if (subtype === "exit") return "SALIDA DE EMERGENCIA"
  if (subtype === "parking") return "ESTACIONAMIENTO"
  if (subtype === "kitchen") return "COCINA"
  return "ESCENARIO"
}

function defaultSectorName(type: VenueElementType): string {
  if (type === "infrastructure") return ""
  if (type === "vip_chair" || type === "vip_box") return "VIP"
  if (type === "round_table" || type === "long_table") return "Mesas"
  if (type === "standing_zone") return "General"
  return "General"
}

export function cloneVenueElement(
  element: VenueMapElement,
  offset = 15,
): VenueMapElement {
  const copy: VenueMapElement = {
    ...element,
    id: `${element.type}-${crypto.randomUUID().slice(0, 8)}`,
    x: element.x + offset,
    y: element.y + offset,
    seats: [],
  }
  copy.seats = rebuildElementSeats(copy)
  return copy
}

export function elementSeatLabel(element: VenueMapElement, number: number): string {
  if (element.type === "round_table") return `${element.label} - Silla ${number}`
  if (element.type === "long_table") return `${element.label} - Asiento ${number}`
  if (element.type === "vip_box") return `${element.label} - Lugar ${number}`
  return `${element.label}`
}

export function formatVenuePriceArs(value: number): string {
  return `$ ${Math.round(value).toLocaleString("es-AR")}`
}

export function describeVenueElementType(element: VenueMapElement): string {
  if (element.type === "round_table") {
    return `Mesa Redonda - ${element.chairCount} Sillas`
  }
  if (element.type === "long_table") {
    const seats = element.sideA + element.sideB
    return `Tablón - ${seats} Asientos`
  }
  if (element.type === "vip_chair") return "Butaca VIP"
  if (element.type === "vip_box") return `Palco - ${element.chairCount} Lugares`
  if (element.type === "standing_zone") return `Zona de pie - Cupo ${element.capacity}`
  if (element.subtype === "bar") return "Barra"
  if (element.subtype === "restroom") return "Baños"
  if (element.subtype === "entrance") return "Entrada"
  if (element.subtype === "exit") return "Salida"
  if (element.subtype === "parking") return "Estacionamiento"
  if (element.subtype === "kitchen") return "Cocina"
  if (element.subtype === "dj_booth") return "Cabina DJ"
  if (element.subtype === "stage") return "Escenario"
  return "Infraestructura"
}

const SHAPE_TO_TYPE: Partial<Record<VenueShapeType, VenueElementType>> = {
  theatre_seat: "vip_chair",
  round_table: "round_table",
  long_table: "long_table",
  vip_box: "vip_box",
  standing_zone: "standing_zone",
}

export function applyVenueShape(
  element: VenueMapElement,
  shapeType: VenueShapeType,
): VenueMapElement {
  const next: VenueMapElement = { ...element, shapeType }
  const mapped = SHAPE_TO_TYPE[shapeType]
  if (
    mapped &&
    mapped !== element.type &&
    element.category === "commercial" &&
    element.type !== "infrastructure"
  ) {
    const fresh = createVenueElement(mapped, 0, { x: element.x, y: element.y })
    next.type = mapped
    next.width = fresh.width
    next.height = fresh.height
    next.chairCount = fresh.chairCount
    next.sideA = fresh.sideA
    next.sideB = fresh.sideB
    next.sellMode = fresh.sellMode
    next.priceMode = fresh.priceMode
    next.capacity = fresh.capacity
    next.roundedCorner = fresh.roundedCorner
    next.seats = rebuildElementSeats(next)
  }
  return next
}

export function explodeVenueSectorToChairs(
  sector: VenueMapSector,
): VenueMapElement[] {
  return sector.seats.map((seat, index) => {
    const chair = createVenueElement("vip_chair", index, {
      x: seat.x,
      y: seat.y,
    })
    chair.id = seat.id || chair.id
    chair.label =
      seat.label?.trim() || `Fila ${seat.row} - Asiento ${seat.number}`
    chair.labelLocked = true
    chair.sectorName = sector.name
    chair.color = sector.color
    chair.price = seat.price ?? sector.price
    chair.rotation = seat.rotation ?? 0
    chair.capacity = 1
    chair.seats = [
      {
        id: `${chair.id}-S1`,
        number: seat.number,
        x: chair.x,
        y: chair.y,
        status: seat.status,
        ...(seat.price != null ? { price: seat.price } : {}),
        ...(seat.rotation != null ? { rotation: seat.rotation } : {}),
        ...(seat.label ? { label: seat.label } : {}),
      },
    ]
    return chair
  })
}
