import { occupiesGeneralCapacity } from "@/lib/inventory/capacity-budget"
import {
  collectVenueMapSectorKeys,
  listAssignableGeneralSectors,
  type LogicalSector,
} from "@/lib/inventory/logical-sectors"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { summarizeVenueInventory } from "@/lib/seating/venue-inventory-dashboard"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"

export const MANIFEST_ORIGIN = {
  map: "Mapa interactivo",
  custom: "Personalizado",
} as const

export const MANIFEST_STATUS = {
  synced: "Sincronizado con mapa",
  independent: "Independiente",
} as const

export type MasterManifestOrigin = keyof typeof MANIFEST_ORIGIN
export type MasterManifestStatus = keyof typeof MANIFEST_STATUS

export type MasterManifestRow = {
  id: string
  origin: MasterManifestOrigin
  originLabel: string
  name: string
  capacity: number
  status: MasterManifestStatus
  statusLabel: string
}

type ManifestTicket = {
  id?: string
  name?: string
  capacity?: number
  tierType?: EventFormValues["tickets"][number]["tierType"]
  layoutType?: EventFormValues["tickets"][number]["layoutType"]
  seatingSectorId?: string | null
  bundleItems?: EventFormValues["tickets"][number]["bundleItems"]
}

export function excludeMapOwnedSectors(
  sectors: readonly LogicalSector[],
  venueMap?: unknown,
): LogicalSector[] {
  const keys = collectVenueMapSectorKeys(venueMap)
  return sectors.filter((sector) => {
    if (keys.ids.has(sector.id)) return false
    return !keys.names.has(sector.name.trim().toLocaleLowerCase("es"))
  })
}

export function dropdownGeneralSectors(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
  venueMap?: unknown,
): LogicalSector[] {
  return excludeMapOwnedSectors(
    listAssignableGeneralSectors(zones, venueMap),
    venueMap,
  )
}

function asCapacity(value: unknown): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export function buildMasterManifestRows(input: {
  tickets?: readonly ManifestTicket[] | null
  venueMap?: unknown
}): MasterManifestRow[] {
  const rows: MasterManifestRow[] = []
  const map = parseVenueMap(input.venueMap)
  const dashboard = summarizeVenueInventory(map)

  if (dashboard.hasInventory) {
    if (dashboard.sectors.length > 0) {
      for (const sector of dashboard.sectors) {
        rows.push({
          id: `map:${sector.id}`,
          origin: "map",
          originLabel: MANIFEST_ORIGIN.map,
          name: sector.name,
          capacity: Math.max(0, sector.people),
          status: "synced",
          statusLabel: MANIFEST_STATUS.synced,
        })
      }
    } else if (dashboard.capacity > 0) {
      rows.push({
        id: "map:all",
        origin: "map",
        originLabel: MANIFEST_ORIGIN.map,
        name: "Mapa interactivo",
        capacity: dashboard.capacity,
        status: "synced",
        statusLabel: MANIFEST_STATUS.synced,
      })
    }
  }

  const tickets = input.tickets ?? []
  tickets.forEach((tier, index) => {
    if (isMapBackedTicket(tier)) return
    const type = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      bundleItems: tier.bundleItems,
    })
    if (type !== "general") return
    if (!occupiesGeneralCapacity(tier, tickets)) return
    const name = (tier.name ?? "").trim() || `Entrada ${index + 1}`
    rows.push({
      id: `ticket:${tier.id ?? index}`,
      origin: "custom",
      originLabel: MANIFEST_ORIGIN.custom,
      name,
      capacity: asCapacity(tier.capacity),
      status: "independent",
      statusLabel: MANIFEST_STATUS.independent,
    })
  })

  return rows
}
