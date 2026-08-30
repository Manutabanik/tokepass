import type { InteractiveVenueMap } from "@/types/venue-map"

export type VenueMapSelection =
  | { kind: "stage" }
  | { kind: "sector"; id: string }
  | { kind: "label"; id: string }
  | { kind: "aisle"; id: string }
  | { kind: "element"; id: string }
  | { kind: "elements"; ids: string[] }
  | { kind: "seats"; ids: string[] }
  | { kind: "zone"; id: string }
  | null

function hasId(
  items: Array<{ id?: string }> | null | undefined,
  id: string,
) {
  const needle = id.trim()
  if (!needle) return false
  return (items ?? []).some((item) => item.id === needle)
}

function liveSeatKeys(map: InteractiveVenueMap | null | undefined) {
  const keys = new Set<string>()
  if (!map) return keys
  for (const sector of map.sectors ?? []) {
    for (const seat of sector.seats ?? []) {
      if (sector.id && seat.id) keys.add(`${sector.id}::${seat.id}`)
    }
  }
  for (const element of map.elements ?? []) {
    for (const seat of element.seats ?? []) {
      if (element.id && seat.id) keys.add(`${element.id}::${seat.id}`)
    }
  }
  return keys
}

export function venueMapSelectionsEqual(
  left: VenueMapSelection,
  right: VenueMapSelection,
) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.kind !== right.kind) return false
  if (left.kind === "stage") return true
  if ("id" in left && "id" in right) return left.id === right.id
  if ("ids" in left && "ids" in right) {
    return (
      left.ids.length === right.ids.length &&
      left.ids.every((id, index) => id === right.ids[index])
    )
  }
  return false
}

/** Drop selection that points at objects no longer on the canvas. */
export function pruneVenueMapSelection(
  selection: VenueMapSelection,
  map: InteractiveVenueMap | null | undefined,
): VenueMapSelection {
  if (!selection) return null
  if (!map) return null
  switch (selection.kind) {
    case "stage":
      return map.stage ? selection : null
    case "sector":
      return hasId(map.sectors, selection.id) ? selection : null
    case "label":
      return hasId(map.labels, selection.id) ? selection : null
    case "aisle":
      return hasId(map.aisles, selection.id) ? selection : null
    case "zone":
      return hasId(map.zones, selection.id) ? selection : null
    case "element":
      return hasId(map.elements, selection.id) ? selection : null
    case "elements": {
      const live = new Set((map.elements ?? []).map((item) => item.id))
      const ids = selection.ids.filter((id) => live.has(id))
      if (ids.length === 0) return null
      if (ids.length === 1) return { kind: "element", id: ids[0]! }
      if (ids.length === selection.ids.length) return selection
      return { kind: "elements", ids }
    }
    case "seats": {
      const live = liveSeatKeys(map)
      const ids = selection.ids.filter((id) => live.has(id))
      if (ids.length === 0) return null
      if (ids.length === selection.ids.length) return selection
      return { kind: "seats", ids }
    }
    default:
      return null
  }
}
