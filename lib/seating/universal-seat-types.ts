/**
 * Esquema universal de sectores para el Seat Selection Flow.
 * Compatible con estadios, teatros, boliches y mesas VIP.
 */

export type SeatStatus = "available" | "occupied" | "blocked"

export type UniversalSeat = {
  id: string
  label: string
  status: SeatStatus
}

export type UniversalSeatGroup = {
  id: string
  name: string
  seats: UniversalSeat[]
}

export type UniversalSectorBase = {
  id: string
  name: string
  color: string
  price: number
  /** Unidades libres (resumen de servidor; no implica asientos hidratados). */
  availableCount?: number
}

export type UniversalGeneralSector = UniversalSectorBase & {
  type: "general"
  maxPerUser: number
}

export type UniversalNumberedSector = UniversalSectorBase & {
  type: "numbered"
  groups: UniversalSeatGroup[]
}

export type UniversalSector = UniversalGeneralSector | UniversalNumberedSector

export type UniversalSeatSelection =
  | {
      kind: "general"
      sectorId: string
      sectorName: string
      color: string
      unitPrice: number
      quantity: number
    }
  | {
      kind: "numbered"
      sectorId: string
      sectorName: string
      color: string
      unitPrice: number
      groupId: string
      groupName: string
      seats: Array<{ id: string; label: string }>
    }

/** Mock flexible: general + numerado en el mismo evento. */
export const UNIVERSAL_SEAT_MOCK: UniversalSector[] = [
  {
    id: "s-general",
    name: "Campo General",
    color: "#10b981",
    price: 15000,
    type: "general",
    maxPerUser: 4,
  },
  {
    id: "s-vip",
    name: "Gradas VIP (Numerado)",
    color: "#f97316",
    price: 50000,
    type: "numbered",
    groups: [
      {
        id: "fila-1",
        name: "Fila 1",
        seats: [
          { id: "f1-1", label: "1", status: "available" },
          { id: "f1-2", label: "2", status: "occupied" },
          { id: "f1-3", label: "3", status: "available" },
          { id: "f1-4", label: "4", status: "available" },
          { id: "f1-5", label: "5", status: "blocked" },
          { id: "f1-6", label: "6", status: "available" },
        ],
      },
      {
        id: "fila-2",
        name: "Fila 2",
        seats: [
          { id: "f2-1", label: "1", status: "available" },
          { id: "f2-2", label: "2", status: "available" },
          { id: "f2-3", label: "3", status: "occupied" },
          { id: "f2-4", label: "4", status: "available" },
          { id: "f2-5", label: "5", status: "available" },
          { id: "f2-6", label: "6", status: "available" },
        ],
      },
      {
        id: "mesa-10",
        name: "Mesa 10",
        seats: [
          { id: "m10-a", label: "A", status: "available" },
          { id: "m10-b", label: "B", status: "available" },
          { id: "m10-c", label: "C", status: "occupied" },
          { id: "m10-d", label: "D", status: "available" },
        ],
      },
    ],
  },
  {
    id: "s-azul",
    name: "Sillas Numeradas (Sector Azul)",
    color: "#2563eb",
    /** Precio All-In de referencia para E2E / zone_tier_pricing. */
    price: 25000,
    type: "numbered",
    groups: [
      {
        id: "azul-fila-1",
        name: "Fila 1",
        seats: [
          { id: "az-1-1", label: "1", status: "available" },
          { id: "az-1-2", label: "2", status: "available" },
          { id: "az-1-3", label: "3", status: "occupied" },
        ],
      },
    ],
  },
]

export function selectionSummary(selection: UniversalSeatSelection | null): string {
  if (!selection) return "Sin selección"
  if (selection.kind === "general") {
    return `${selection.sectorName} x${selection.quantity}`
  }
  const seats = selection.seats.map((seat) => seat.label).join(", ")
  return `${selection.sectorName} · ${selection.groupName}, Asiento${selection.seats.length > 1 ? "s" : ""} ${seats}`
}

export function selectionTotal(selection: UniversalSeatSelection | null): number {
  if (!selection) return 0
  if (selection.kind === "general") {
    return selection.unitPrice * selection.quantity
  }
  return selection.unitPrice * selection.seats.length
}

export function isSelectionValid(selection: UniversalSeatSelection | null): boolean {
  if (!selection) return false
  if (selection.kind === "general") return selection.quantity >= 1
  return selection.seats.length >= 1
}
