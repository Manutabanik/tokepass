import {
  cartMapUnitIdsForSchedule,
  type CartIdentityLine,
} from "@/lib/checkout/cart-item-identity"
import { BUYER_SEAT_FILL } from "@/lib/seating/buyer-seat-fill"
import { isSoldInventoryStatus } from "@/lib/seating/inventory-seat-state"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { storefrontItemMatchesSchedule } from "@/lib/checkout/seat-hold-day"
import type {
  StorefrontLayoutSeat,
  StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
import type { InteractiveVenueMap } from "@/types/venue-map"

export const BUYER_SELECTION_FILL = "#10b981"
export const BUYER_SELECTION_GLOW =
  "drop-shadow(0px 0px 10px rgba(16, 185, 129, 0.9))"

const SELECTED_ATTR = "data-selected"
const HIGHLIGHT_ATTR = "data-highlighted"
const LOCKED_ATTR = "data-locked"
const ORIG_FILL = "data-paint-fill"
const ORIG_STROKE = "data-paint-stroke"
const ORIG_SW = "data-paint-sw"
const ORIG_FILTER = "data-paint-filter"

export function buyerSelectionUnitIds(input: {
  selectedItems: StorefrontSelectedItem[]
  layoutSeats?: StorefrontLayoutSeat[]
  cartLines?: readonly CartIdentityLine[]
  map?: InteractiveVenueMap | null
  mapScheduleId?: string | null
  scheduleDayCount?: number
}): Set<string> {
  const ids = new Set<string>()
  const schedule = input.mapScheduleId ?? null
  const scheduleDayCount = input.scheduleDayCount ?? 0

  for (const id of cartMapUnitIdsForSchedule(input.cartLines ?? [], schedule)) {
    if (id) ids.add(id)
  }

  const items = (input.selectedItems ?? []).filter((item) =>
    storefrontItemMatchesSchedule(item, schedule, { scheduleDayCount }),
  )
  for (const item of items) {
    if (item.id) ids.add(item.id)
    if (item.type !== "table" || !input.map) continue
    const element = (input.map.elements ?? []).find(
      (entry) => entry.id === item.id,
    )
    for (const seat of element?.seats ?? []) {
      if (seat.id) ids.add(seat.id)
    }
  }

  for (const seat of input.layoutSeats ?? []) {
    if (
      storefrontItemMatchesSchedule(seat, schedule, { scheduleDayCount }) &&
      seat.id
    ) {
      ids.add(seat.id)
    }
  }

  return ids
}

function isLocked(node: Element) {
  return node.getAttribute(LOCKED_ATTR) === "1"
}

function markToggle(node: Element, attr: string, on: boolean) {
  const next = on ? "1" : "0"
  if (node.getAttribute(attr) === next) return false
  node.setAttribute(attr, next)
  return true
}

function rememberPaint(shape: Element) {
  if (!shape.hasAttribute(ORIG_FILL)) {
    shape.setAttribute(ORIG_FILL, shape.getAttribute("fill") ?? "")
    shape.setAttribute(ORIG_STROKE, shape.getAttribute("stroke") ?? "")
    shape.setAttribute(ORIG_SW, shape.getAttribute("stroke-width") ?? "")
  }
}

function restorePaint(shape: Element) {
  const fill = shape.getAttribute(ORIG_FILL)
  const stroke = shape.getAttribute(ORIG_STROKE)
  const sw = shape.getAttribute(ORIG_SW)
  if (fill != null) shape.setAttribute("fill", fill)
  if (stroke != null) shape.setAttribute("stroke", stroke)
  if (sw != null) shape.setAttribute("stroke-width", sw)
}

function paintShapes(node: Element, on: boolean) {
  const shapes = node.querySelectorAll<SVGElement>(
    "path, circle, rect, ellipse, polygon, polyline",
  )
  for (const shape of shapes) {
    if (shape.getAttribute("fill") === "transparent") continue
    if (on) {
      rememberPaint(shape)
      shape.setAttribute("fill", BUYER_SELECTION_FILL)
      shape.setAttribute("stroke", BUYER_SELECTION_FILL)
      if (!shape.getAttribute("stroke-width")) {
        shape.setAttribute("stroke-width", "2.2")
      }
    } else {
      restorePaint(shape)
    }
  }
}

function paintNode(node: Element, on: boolean) {
  if (isLocked(node)) return
  const host = node as HTMLElement | SVGElement
  if (on) {
    if (!host.getAttribute(ORIG_FILTER)) {
      host.setAttribute(ORIG_FILTER, host.style.filter ?? "")
    }
    host.style.filter = BUYER_SELECTION_GLOW
  } else {
    const prev = host.getAttribute(ORIG_FILTER)
    host.style.filter = prev ?? ""
  }
  paintShapes(node, on)
}

/** Pinta SOLD en el SVG sin remount (equivalente a fabric.renderAll). */
export function paintBuyerMapSold(
  root: Element | null,
  soldIds: Iterable<string>,
) {
  if (!root) return
  const sold = soldIds instanceof Set ? soldIds : new Set(soldIds)
  const nodes = root.querySelectorAll<Element>(
    "[data-seat-id], [data-element-id], [data-zone-id]",
  )
  for (const node of nodes) {
    const id =
      node.getAttribute("data-seat-id") ||
      node.getAttribute("data-element-id") ||
      node.getAttribute("data-zone-id")
    if (!id) continue
    const isSold = sold.has(id)
    markToggle(node, LOCKED_ATTR, isSold)
    const host = node as SVGElement
    const shapes = node.querySelectorAll<SVGElement>(
      "path, circle, rect, ellipse, polygon, polyline",
    )
    if (isSold) {
      host.style.pointerEvents = "none"
      host.style.cursor = "not-allowed"
      for (const shape of shapes) {
        if (shape.getAttribute("fill") === "transparent") continue
        rememberPaint(shape)
        shape.setAttribute("fill", BUYER_SEAT_FILL.sold)
        shape.setAttribute("stroke", "#374151")
      }
      continue
    }
    host.style.pointerEvents = ""
    host.style.cursor = ""
    for (const shape of shapes) {
      if (shape.getAttribute("fill") === "transparent") continue
      restorePaint(shape)
    }
  }
}

export function soldIdsFromOccupancy(
  occupancy: Record<string, SeatStatus>,
): string[] {
  const ids: string[] = []
  for (const [id, status] of Object.entries(occupancy)) {
    if (isSoldInventoryStatus(status)) ids.push(id)
  }
  return ids
}

export function paintBuyerMapSelection(
  root: Element | null,
  selectedIds: Iterable<string>,
  highlightedIds: Iterable<string> = [],
) {
  if (!root) return
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  const highlighted =
    highlightedIds instanceof Set ? highlightedIds : new Set(highlightedIds)

  const nodes = root.querySelectorAll<Element>(
    "[data-seat-id], [data-element-id], [data-zone-id]",
  )
  for (const node of nodes) {
    const id =
      node.getAttribute("data-seat-id") ||
      node.getAttribute("data-element-id") ||
      node.getAttribute("data-zone-id")
    if (!id) continue
    const isSelected = selected.has(id)
    const isHighlighted = highlighted.has(id)
    markToggle(node, SELECTED_ATTR, isSelected)
    markToggle(node, HIGHLIGHT_ATTR, isHighlighted)
    paintNode(node, isSelected || isHighlighted)
  }

  if (root instanceof HTMLElement || root instanceof SVGElement) {
    root.setAttribute("data-has-selection", selected.size > 0 ? "1" : "0")
  }
}

export function shouldRestoreBuyerViewport(input: {
  current: { scale: number; positionX: number; positionY: number }
  saved: { scale: number; positionX: number; positionY: number }
  selectionQuiet: boolean
}): boolean {
  if (!input.selectionQuiet) return false
  const reset = (viewport: {
    scale: number
    positionX: number
    positionY: number
  }) =>
    Math.abs(viewport.scale - 1) < 0.02 &&
    Math.abs(viewport.positionX) < 2 &&
    Math.abs(viewport.positionY) < 2
  return reset(input.current) && !reset(input.saved)
}
