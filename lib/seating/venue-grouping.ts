import type { VenueMapElement } from "@/types/venue-map"

export function elementGroupMembers(
  elements: VenueMapElement[],
  elementId: string,
): VenueMapElement[] {
  const target = elements.find((item) => item.id === elementId)
  if (!target) return []
  const groupId = target.groupId?.trim()
  if (!groupId) return [target]
  const members = elements.filter((item) => item.groupId?.trim() === groupId)
  return members.length > 0 ? members : [target]
}

export function expandElementSelection(
  elements: VenueMapElement[],
  clickedId: string,
  currentIds: string[],
  additive: boolean,
  options?: { isolate?: boolean },
): string[] {
  const bunch = options?.isolate
    ? elements.some((item) => item.id === clickedId)
      ? [clickedId]
      : []
    : elementGroupMembers(elements, clickedId).map((item) => item.id)
  if (bunch.length === 0) return currentIds
  if (!additive) return bunch
  const set = new Set(currentIds)
  const allSelected = bunch.every((id) => set.has(id))
  if (allSelected) {
    for (const id of bunch) set.delete(id)
  } else {
    for (const id of bunch) set.add(id)
  }
  return [...set]
}

export function elementsInGroup(
  elements: VenueMapElement[],
  groupId: string,
): VenueMapElement[] {
  const id = groupId.trim()
  if (!id) return []
  return elements.filter((item) => item.groupId?.trim() === id)
}

export function selectionFromIds(ids: string[]): {
  kind: "element" | "elements"
  id?: string
  ids?: string[]
} | null {
  if (ids.length === 0) return null
  if (ids.length === 1) return { kind: "element", id: ids[0]! }
  return { kind: "elements", ids }
}

export function groupVenueElements(
  elements: VenueMapElement[],
  selectedIds: string[],
  groupName?: string,
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  if (selected.length < 2) return elements
  const groupId = crypto.randomUUID()
  const name =
    groupName?.trim() ||
    selected[0]?.groupName?.trim() ||
    selected[0]?.sectorName?.trim() ||
    "Grupo"
  return elements.map((item) =>
    ids.has(item.id)
      ? { ...item, groupId, groupName: name }
      : item,
  )
}

export function ungroupVenueElements(
  elements: VenueMapElement[],
  selectedIds: string[],
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  if (ids.size === 0) return elements
  return elements.map((item) => {
    if (!ids.has(item.id)) return item
    const next = { ...item }
    delete next.groupId
    delete next.groupName
    return next
  })
}

export function selectionHasGroup(
  elements: VenueMapElement[],
  selectedIds: string[],
): boolean {
  const ids = new Set(selectedIds)
  return elements.some((item) => ids.has(item.id) && Boolean(item.groupId?.trim()))
}

/** True when every selected item shares one groupId (a logical group). */
export function selectionIsLogicalGroup(
  elements: VenueMapElement[],
  selectedIds: string[],
): boolean {
  if (selectedIds.length < 2) return false
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  const groupId = selected[0]?.groupId?.trim()
  if (!groupId || selected.length !== ids.size) return false
  return selected.every((item) => item.groupId?.trim() === groupId)
}

export function selectionHasLocked(
  elements: VenueMapElement[],
  selectedIds: string[],
): boolean {
  const ids = new Set(selectedIds)
  return elements.some((item) => ids.has(item.id) && item.isLocked === true)
}

export function selectionIsFullyLocked(
  elements: VenueMapElement[],
  selectedIds: string[],
): boolean {
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  return selected.length > 0 && selected.every((item) => item.isLocked === true)
}

export function toggleElementsLocked(
  elements: VenueMapElement[],
  selectedIds: string[],
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  if (selected.length === 0) return elements
  const nextLocked = !selected.every((item) => item.isLocked === true)
  return elements.map((item) => {
    if (!ids.has(item.id)) return item
    if (nextLocked) return { ...item, isLocked: true }
    const next = { ...item }
    delete next.isLocked
    return next
  })
}
