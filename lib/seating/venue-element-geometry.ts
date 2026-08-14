import type {
  VenueMapElement,
  VenueMapElementSeat,
  VenueElementType,
  VenueInfraSubtype,
} from "@/types/venue-map"

const ZONE_COLORS = ["#f97316", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#06b6d4"]

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
    const radius = 26 + count * 1.2
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
    const gap = 16
    const width = Math.max(element.width, Math.max(sideA, sideB) * gap + 24)
    const height = Math.max(element.height, 28)
    const seats: VenueMapElementSeat[] = []
    let number = 1
    for (let index = 0; index < sideA; index += 1) {
      const t = sideA === 1 ? 0.5 : index / (sideA - 1)
      const local = rotatePoint(
        element.x - width / 2 + 12 + t * (width - 24),
        element.y - height / 2 - 14,
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
        element.x - width / 2 + 12 + t * (width - 24),
        element.y + height / 2 + 14,
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
): VenueMapElement {
  const color = ZONE_COLORS[index % ZONE_COLORS.length]!
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
  const base: VenueMapElement = {
    id,
    type,
    subtype,
    label: defaultLabel(type, index, subtype),
    category: defaultCategory(type),
    x: point.x,
    y: point.y,
    width: 80,
    height: 48,
    rotation: 0,
    price: 0,
    color,
    chairCount: type === "round_table" ? 8 : 6,
    sideA: 4,
    sideB: 4,
    sellMode: type === "vip_box" ? "group" : "per_seat",
    capacity: type === "standing_zone" ? 80 : 0,
    seats: [],
  }
  if (type === "standing_zone") {
    base.width = 160
    base.height = 100
    base.color = "#10b981"
  }
  if (type === "long_table") {
    base.width = 96
    base.height = 28
  }
  if (type === "vip_box") {
    base.width = 88
    base.height = 56
    base.color = "#a855f7"
  }
  if (type === "infrastructure") {
    base.width = subtype === "stage" || subtype === "dj_booth" ? 280 : 72
    base.height = subtype === "stage" || subtype === "dj_booth" ? 48 : 40
    base.color = "#e4e4e7"
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
  if (subtype === "exit") return "SALIDA"
  return "ESCENARIO"
}

function defaultCategory(type: VenueElementType): string {
  if (type === "vip_chair" || type === "vip_box") return "VIP"
  if (type === "round_table" || type === "long_table") return "Mesa Premium"
  if (type === "standing_zone") return "General"
  return "Infraestructura"
}

export function cloneVenueElement(
  element: VenueMapElement,
  offset = 28,
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
