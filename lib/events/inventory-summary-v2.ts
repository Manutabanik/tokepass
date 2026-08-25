import { isMapDraftTicket } from "@/lib/events/draft-seating-map-v2"
import { draftNumberValue } from "@/lib/validations/event-draft-v2"

export const INVENTORY_SUMMARY_KINDS = ["general", "extra", "mapa"] as const
export type InventorySummaryKind = (typeof INVENTORY_SUMMARY_KINDS)[number]

export type InventorySummarySource =
  | { field: "tickets"; index: number }
  | { field: "extras"; index: number }
  | { field: "seatingMap.sectors"; index: number; ticketIndex: number | null }

export type InventorySummaryRow = {
  key: string
  type: InventorySummaryKind
  name: string
  price: number
  stock: number
  stockReadOnly: boolean
  source: InventorySummarySource
}

export type InventorySummaryTotals = {
  stock: number
  revenue: number
}

type DraftSummaryItem = {
  name?: unknown
  price?: unknown
  stock?: unknown
  source?: unknown
  sectorId?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function itemName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.trim() : ""
  return name || fallback
}

export function sectorCapacity(sector: unknown): number {
  const record = asRecord(sector)
  if (!record) return 0
  const seats = record.seats
  if (Array.isArray(seats) && seats.length > 0) {
    return seats.reduce((sum, seat) => {
      const row = asRecord(seat)
      if (!row) return sum
      return row.status === "blocked" ? sum : sum + 1
    }, 0)
  }
  const rows = Math.max(0, Math.floor(Number(record.rows) || 0))
  const perRow = Math.max(0, Math.floor(Number(record.seatsPerRow) || 0))
  return rows * perRow
}

export function sectorIdOf(sector: unknown): string {
  const record = asRecord(sector)
  const id = typeof record?.id === "string" ? record.id.trim() : ""
  return id
}

export function buildInventorySummaryRows(input: {
  tickets?: DraftSummaryItem[] | null
  extras?: DraftSummaryItem[] | null
  sectors?: unknown
}): InventorySummaryRow[] {
  const tickets = input.tickets ?? []
  const extras = input.extras ?? []
  const sectors = Array.isArray(input.sectors) ? input.sectors : []
  const rows: InventorySummaryRow[] = []
  const coveredSectorIds = new Set<string>()

  tickets.forEach((ticket, index) => {
    if (isMapDraftTicket(ticket)) return
    rows.push({
      key: `tickets:${index}`,
      type: "general",
      name: itemName(ticket.name, `Entrada ${index + 1}`),
      price: draftNumberValue(ticket.price),
      stock: draftNumberValue(ticket.stock),
      stockReadOnly: false,
      source: { field: "tickets", index },
    })
  })

  sectors.forEach((sector, index) => {
    const record = asRecord(sector)
    if (!record) return
    const sectorId = sectorIdOf(sector)
    if (sectorId) coveredSectorIds.add(sectorId)
    const ticketIndex = sectorId
      ? tickets.findIndex(
          (ticket) => String(ticket.sectorId ?? "").trim() === sectorId,
        )
      : -1
    rows.push({
      key: sectorId ? `sector:${sectorId}` : `sector:${index}`,
      type: "mapa",
      name: itemName(record.name, `Sector ${index + 1}`),
      price: draftNumberValue(record.price),
      stock: sectorCapacity(sector),
      stockReadOnly: true,
      source: {
        field: "seatingMap.sectors",
        index,
        ticketIndex: ticketIndex >= 0 ? ticketIndex : null,
      },
    })
  })

  tickets.forEach((ticket, index) => {
    if (!isMapDraftTicket(ticket)) return
    const sectorId = String(ticket.sectorId ?? "").trim()
    if (sectorId && coveredSectorIds.has(sectorId)) return
    rows.push({
      key: `map-ticket:${index}`,
      type: "mapa",
      name: itemName(ticket.name, `Sector ${index + 1}`),
      price: draftNumberValue(ticket.price),
      stock: draftNumberValue(ticket.stock),
      stockReadOnly: true,
      source: { field: "tickets", index },
    })
  })

  extras.forEach((extra, index) => {
    rows.push({
      key: `extras:${index}`,
      type: "extra",
      name: itemName(extra.name, `Extra ${index + 1}`),
      price: draftNumberValue(extra.price),
      stock: draftNumberValue(extra.stock),
      stockReadOnly: false,
      source: { field: "extras", index },
    })
  })

  return rows
}

export function inventorySummaryTotals(
  rows: InventorySummaryRow[],
): InventorySummaryTotals {
  return rows.reduce<InventorySummaryTotals>(
    (totals, row) => ({
      stock: totals.stock + Math.max(0, row.stock),
      revenue: totals.revenue + Math.max(0, row.price) * Math.max(0, row.stock),
    }),
    { stock: 0, revenue: 0 },
  )
}
