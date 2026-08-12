import type { VenueZoneBlueprint } from "@/app/actions/venues"
import type { VenueZoneDraft } from "@/components/admin/smart-venue-builder"
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

export function draftZonesToBlueprint(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueZoneBlueprint[] {
  return zones.map((zone) => ({
    name: zone.name.trim(),
    type: zone.layoutType === "general" ? zone.type : "general_admission",
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
      seating?.rows.length
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
