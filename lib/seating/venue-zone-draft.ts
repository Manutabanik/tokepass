import type { VenueZoneBlueprint } from "@/app/actions/venues"
import type { VenueZoneDraft } from "@/components/admin/smart-venue-builder"
import { venueMapToSeatingLayout } from "@/lib/seating/venue-map-geometry"
import type { InteractiveVenueMap } from "@/types/venue-map"
import {
  getVenueSeatingItems,
  type VenueSeatingLayout,
} from "@/types/venues"

export function draftZoneCapacity(
  zone: VenueZoneDraft,
  structured = true,
): number {
  if (!structured || zone.layoutType === "general") {
    return Number(zone.capacity) || 0
  }
  return zone.rows.reduce(
    (total, row) =>
      total +
      row.items.reduce(
        (subtotal, item) => subtotal + Math.max(1, item.capacity),
        0,
      ),
    0,
  )
}

export function blueprintZoneType(
  zone: Pick<VenueZoneDraft, "layoutType" | "type">,
): VenueZoneBlueprint["type"] {
  if (zone.layoutType === "numbered_seat" || zone.layoutType === "table_combo") {
    return "reserved_seating"
  }
  return zone.type === "reserved_seating"
    ? "reserved_seating"
    : "general_admission"
}

export function draftZonesToBlueprint(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueZoneBlueprint[] {
  return zones.map((zone) => ({
    name: zone.name.trim(),
    type: blueprintZoneType(zone),
    capacity: draftZoneCapacity(zone, structured),
    rows: null,
    seatsPerRow: null,
  }))
}

export function draftZonesToSeatingLayout(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueSeatingLayout {
  return zones.map((zone) => {
    const defaultCapacity =
      zone.rows[0]?.items[0]?.capacity ??
      (Number(zone.rows[0]?.capacityPerUnit) || 1)
    return {
      id: zone.key,
      sector_name: zone.name.trim(),
      color: zone.color,
      pricing_tier_id: null,
      layout_type: structured ? zone.layoutType : "general",
      capacity_per_unit: Math.max(1, defaultCapacity || 1),
      rows:
        !structured || zone.layoutType === "general"
          ? []
          : zone.rows.map((row, index) => ({
              row_id: row.key,
              row_number: index + 1,
              row_label: row.label.trim() || `Fila ${index + 1}`,
              items: row.items,
            })),
      items: undefined,
    }
  })
}

export function zonesToDraft(
  venueId: string,
  zones: VenueZoneBlueprint[],
  seatingLayout: VenueSeatingLayout,
): VenueZoneDraft[] {
  return zones.map((zone, index) => {
    const seating = seatingLayout.find(
      (sector) => sector.sector_name === zone.name,
    )
    const legacyItems = seating ? getVenueSeatingItems(seating) : []
    const seatingRows =
      seating?.rows?.length
        ? seating.rows
        : legacyItems.length > 0
          ? [
              {
                row_id: `${seating?.id ?? venueId}-legacy-row`,
                row_number: 1,
                row_label: "Fila 1",
                items: legacyItems,
              },
            ]
          : []
    return {
      key: seating?.id ?? `${venueId}-${index}`,
      name: zone.name,
      type: zone.type,
      layoutType: seating?.layout_type ?? "general",
      capacity: String(zone.capacity),
      rows: seatingRows.map((row) => ({
        key: row.row_id,
        label: row.row_label,
        itemCount: String(row.items.length),
        labelPrefix:
          seating?.layout_type === "numbered_seat" ? "Butaca " : "Mesa ",
        capacityPerUnit: String(
          row.items[0]?.capacity ?? seating?.capacity_per_unit ?? 1,
        ),
        items: row.items,
      })),
      color: seating?.color ?? "#10B981",
    }
  })
}

export function totalDraftCapacity(
  zones: VenueZoneDraft[],
  structured: boolean,
): number {
  return zones.reduce(
    (sum, zone) => sum + draftZoneCapacity(zone, structured),
    0,
  )
}

export function venueMapToZoneDrafts(map: InteractiveVenueMap): VenueZoneDraft[] {
  const layout = venueMapToSeatingLayout(map)
  return layout.map((sector) => {
    const element =
      (map.elements ?? []).find((item) => item.id === sector.id) ??
      (map.elements ?? []).find((item) => item.groupId === sector.id)
    const isGeneral = sector.layout_type === "general"
    const isTable = sector.layout_type === "table_combo"
    const itemCount = sector.rows.reduce(
      (sum, row) =>
        sum + row.items.filter((item) => item.status !== "blocked").length,
      0,
    )
    const capacity = isGeneral
      ? Math.max(1, element?.capacity ?? 1)
      : isTable
        ? sector.capacity_per_unit
        : itemCount
    return {
      key: sector.id,
      name: sector.sector_name,
      type: isGeneral
        ? ("general_admission" as const)
        : ("reserved_seating" as const),
      layoutType: sector.layout_type,
      capacity: String(capacity),
      rows: sector.rows.map((row) => ({
        key: row.row_id,
        label: row.row_label,
        itemCount: String(row.items.length),
        labelPrefix: isTable ? "Mesa " : "Butaca ",
        capacityPerUnit: String(sector.capacity_per_unit),
        items: row.items,
      })),
      color: sector.color,
    }
  })
}
