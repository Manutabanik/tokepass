import {
  cartMapUnitIdsForSchedule,
  type CartIdentityLine,
} from "@/lib/checkout/cart-item-identity"
import { BUYER_SEAT_FILL } from "@/lib/seating/buyer-seat-fill"
import { isBuyerUnavailableStatus } from "@/lib/seating/buyer-seat-fill"
import { hexLuminance } from "@/lib/seating/canvas-label-fill"
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

/** Anillo del sector elegido. Sobre un relleno muy claro el blanco no se ve. */
const ZONE_RING = "#FFFFFF"
const ZONE_RING_ON_LIGHT = "#18181B"
const ZONE_BASE_FALLBACK = "#22D3EE"

export type BuyerZonePaint = {
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  /** CSS `filter`: el resplandor en SVG es un drop-shadow, no un shadowBlur. */
  glow?: string
  /** El agotado no se puede clickear. */
  interactive: boolean
}

export function buyerZoneRing(baseColor: string): string {
  const luminance = hexLuminance(baseColor)
  return luminance != null && luminance > 0.75 ? ZONE_RING_ON_LIGHT : ZONE_RING
}

/**
 * Los tres estados que el comprador tiene que poder leer sin texto: agotado, en
 * el carrito y disponible. El color del sector se mantiene en los tres; lo que
 * cambia es la solidez, el anillo y el resplandor.
 *
 * La pertenencia al carrito la resuelve el llamador a propósito: sale de tres
 * lugares distintos (la prop de React, `useStorefrontSeatStore` y las líneas
 * del checkout), y esconder esa resolución acá adentro volvería a mezclar
 * navegación con carrito.
 */
export function buyerZonePaint(input: {
  selected: boolean
  soldOut: boolean
  baseColor: string
}): BuyerZonePaint {
  const base = input.baseColor?.trim() || ZONE_BASE_FALLBACK
  if (input.soldOut) {
    // El gris tiene que leerse sobre la foto del predio: con un relleno muy
    // tenue el sector agotado parecía no estar dibujado.
    return {
      fill: BUYER_SEAT_FILL.sold,
      fillOpacity: 0.55,
      stroke: "#374151",
      strokeWidth: 2,
      interactive: false,
    }
  }
  if (input.selected) {
    return {
      fill: base,
      fillOpacity: 0.9,
      stroke: buyerZoneRing(base),
      strokeWidth: 3,
      glow: `drop-shadow(0px 0px 10px ${base})`,
      interactive: true,
    }
  }
  return {
    fill: base,
    fillOpacity: 0.4,
    stroke: base,
    strokeWidth: 2,
    interactive: true,
  }
}

const SELECTED_ATTR = "data-selected"
const HIGHLIGHT_ATTR = "data-highlighted"
const LOCKED_ATTR = "data-locked"
const ORIG_FILL = "data-paint-fill"
const ORIG_STROKE = "data-paint-stroke"
const ORIG_SW = "data-paint-sw"
const ORIG_FILTER = "data-paint-filter"

const SHAPE_SELECTOR = "path, circle, rect, ellipse, polygon, polyline"

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

function restoreAttr(shape: Element, attr: string, memory: string) {
  const prev = shape.getAttribute(memory)
  if (prev == null) return
  if (prev === "") shape.removeAttribute(attr)
  else shape.setAttribute(attr, prev)
}

function restorePaint(shape: Element) {
  restoreAttr(shape, "fill", ORIG_FILL)
  restoreAttr(shape, "stroke", ORIG_STROKE)
  restoreAttr(shape, "stroke-width", ORIG_SW)
}

/** `transparent` marca las áreas de hit: pintarlas las volvería visibles. */
function isHitArea(shape: Element) {
  return shape.getAttribute("fill") === "transparent"
}

/** La zona agrega un contorno sin relleno que tampoco tiene que teñirse. */
function isZoneHitArea(shape: Element) {
  return isHitArea(shape) || shape.getAttribute("fill") === "none"
}

/**
 * La butaca elegida se pinta con el verde del carrito: su color base ya es el
 * estado (disponible / tomada), así que reusarlo borraría la selección.
 */
function paintUnitShapes(node: Element, on: boolean) {
  for (const shape of node.querySelectorAll<SVGElement>(SHAPE_SELECTOR)) {
    if (isHitArea(shape)) continue
    if (!on) {
      restorePaint(shape)
      continue
    }
    rememberPaint(shape)
    shape.setAttribute("fill", BUYER_SELECTION_FILL)
    shape.setAttribute("stroke", BUYER_SELECTION_FILL)
    if (!shape.getAttribute("stroke-width")) {
      shape.setAttribute("stroke-width", "2.2")
    }
  }
}

/**
 * El sector elegido mantiene su color y cambia de estado: anillo de contraste y
 * resplandor propio, la misma regla que aplica React al render, así que un
 * re-render no pelea con esta pasada.
 *
 * La opacidad la deja en manos de React a propósito: depende de la vista (macro,
 * micro, zona enfocada) y devolver acá un valor capturado antes lo replicaría en
 * la vista equivocada.
 */
function paintZoneShapes(node: Element, on: boolean): string | null {
  let base: string | null = null
  // `data-zone-id` va tanto en el grupo como en el polígono, así que el nodo
  // puede ser él mismo la figura a pintar.
  const shapes = node.matches(SHAPE_SELECTOR)
    ? [node as SVGElement]
    : Array.from(node.querySelectorAll<SVGElement>(SHAPE_SELECTOR))
  for (const shape of shapes) {
    if (isZoneHitArea(shape)) continue
    if (!on) {
      restorePaint(shape)
      continue
    }
    rememberPaint(shape)
    const paint = buyerZonePaint({
      selected: true,
      soldOut: false,
      baseColor: shape.getAttribute(ORIG_FILL) ?? "",
    })
    base = base ?? paint.fill
    shape.setAttribute("fill", paint.fill)
    shape.setAttribute("stroke", paint.stroke)
    shape.setAttribute("stroke-width", String(paint.strokeWidth))
  }
  return base
}

function paintNode(node: Element, on: boolean, zone: boolean) {
  if (isLocked(node)) return
  const host = node as HTMLElement | SVGElement
  let glow = BUYER_SELECTION_GLOW
  if (zone) {
    const base = paintZoneShapes(node, on)
    glow =
      buyerZonePaint({
        selected: true,
        soldOut: false,
        baseColor: base ?? "",
      }).glow ?? BUYER_SELECTION_GLOW
  } else {
    paintUnitShapes(node, on)
  }

  if (!on) {
    const prev = host.getAttribute(ORIG_FILTER)
    host.style.filter = prev ?? ""
    return
  }
  if (!host.getAttribute(ORIG_FILTER)) {
    host.setAttribute(ORIG_FILTER, host.style.filter ?? "")
  }
  host.style.filter = glow
}

const UNIT_SELECTOR = "[data-seat-id], [data-element-id], [data-zone-id]"

function unitRef(node: Element): { id: string; zone: boolean } | null {
  const unit =
    node.getAttribute("data-seat-id") || node.getAttribute("data-element-id")
  if (unit) return { id: unit, zone: false }
  const zone = node.getAttribute("data-zone-id")
  if (zone) return { id: zone, zone: true }
  return null
}

/** Pinta SOLD en el SVG sin remount (equivalente a fabric.renderAll). */
export function paintBuyerMapSold(
  root: Element | null,
  soldIds: Iterable<string>,
) {
  if (!root) return
  const sold = soldIds instanceof Set ? soldIds : new Set(soldIds)
  for (const node of root.querySelectorAll<Element>(UNIT_SELECTOR)) {
    const ref = unitRef(node)
    if (!ref) continue
    const isSold = sold.has(ref.id)
    markToggle(node, LOCKED_ATTR, isSold)
    const host = node as SVGElement
    const shapes = node.querySelectorAll<SVGElement>(SHAPE_SELECTOR)
    if (isSold) {
      const paint = buyerZonePaint({
        selected: false,
        soldOut: true,
        baseColor: "",
      })
      host.style.pointerEvents = paint.interactive ? "" : "none"
      host.style.cursor = "not-allowed"
      for (const shape of shapes) {
        if (isHitArea(shape)) continue
        rememberPaint(shape)
        shape.setAttribute("fill", paint.fill)
        shape.setAttribute("stroke", paint.stroke)
      }
      continue
    }
    host.style.pointerEvents = ""
    host.style.cursor = ""
    for (const shape of shapes) {
      if (isHitArea(shape)) continue
      restorePaint(shape)
    }
  }
}

export function soldIdsFromOccupancy(
  occupancy: Record<string, SeatStatus>,
): string[] {
  const ids: string[] = []
  for (const [id, status] of Object.entries(occupancy)) {
    if (isBuyerUnavailableStatus(status)) ids.push(id)
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

  for (const node of root.querySelectorAll<Element>(UNIT_SELECTOR)) {
    const ref = unitRef(node)
    if (!ref) continue
    const isSelected = selected.has(ref.id)
    const isHighlighted = highlighted.has(ref.id)
    markToggle(node, SELECTED_ATTR, isSelected)
    markToggle(node, HIGHLIGHT_ATTR, isHighlighted)
    paintNode(node, isSelected || isHighlighted, ref.zone)
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
