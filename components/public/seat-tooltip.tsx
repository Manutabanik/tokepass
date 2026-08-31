"use client"

import { Locate, Minus, Plus } from "lucide-react"

import { formatCurrency } from "@/lib/format"
import { SEAT_HELD_BY_OTHER_MESSAGE } from "@/lib/seating/inventory-seat-state"
import { cn } from "@/lib/utils"

export type BuyerMapHoverItem = {
  sectorName: string
  seatNumber?: number | string | null
  row?: string | null
  price: number
  heldByOther?: boolean
}

export function SeatTooltip({
  item,
  x,
  y,
}: {
  item: BuyerMapHoverItem
  x: number
  y: number
}) {
  const sectorName = item.sectorName?.trim() || "Sector"
  const hasSeat =
    item.seatNumber != null && String(item.seatNumber).trim().length > 0
  const hasRow = Boolean(item.row?.toString().trim())
  const seatDetail = hasSeat
    ? `${hasRow ? `Fila ${item.row}, ` : ""}Asiento ${item.seatNumber}`
    : null
  const formattedPrice = formatCurrency(Number(item.price) || 0)

  return (
    <div
      className="pointer-events-none absolute z-50 flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-black/90 px-3 py-2 shadow-2xl backdrop-blur-sm"
      style={{ left: x, top: y }}
      role="status"
    >
      <span className="whitespace-nowrap text-xs font-bold text-white">
        {sectorName}
        {seatDetail ? (
          <span className="font-semibold text-white/70"> · {seatDetail}</span>
        ) : null}
      </span>
      <span className="text-sm font-black text-emerald-400">
        {formattedPrice}
      </span>
      {item.heldByOther ? (
        <span className="max-w-[240px] text-center text-[11px] font-medium leading-snug text-amber-300">
          {SEAT_HELD_BY_OTHER_MESSAGE}
        </span>
      ) : null}
    </div>
  )
}

function tooltipBoxSize(item?: BuyerMapHoverItem) {
  if (item?.heldByOther) return { width: 280, height: 140 }
  return { width: 196, height: 58 }
}

export function clampTooltipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  item?: BuyerMapHoverItem,
) {
  const { width: tooltipWidth, height: tooltipHeight } = tooltipBoxSize(item)
  return {
    x: Math.min(Math.max(8, x + 12), Math.max(8, width - tooltipWidth - 8)),
    y: Math.min(
      Math.max(8, y - tooltipHeight - 10),
      Math.max(8, height - tooltipHeight - 8),
    ),
  }
}

export function resolveBuyerHoverFromTarget(
  target: EventTarget | null,
  lookup: {
    seatById: Map<string, BuyerMapHoverItem>
    zoneById: Map<string, BuyerMapHoverItem>
    elementById: Map<string, BuyerMapHoverItem>
  },
): BuyerMapHoverItem | null {
  const node = target instanceof Element ? target : null
  if (!node) return null
  const seatId = node.closest("[data-seat-id]")?.getAttribute("data-seat-id")
  if (seatId) {
    const seat = lookup.seatById.get(seatId)
    if (seat) return seat
  }
  const elementId = node
    .closest("[data-element-id]")
    ?.getAttribute("data-element-id")
  if (elementId) {
    const element = lookup.elementById.get(elementId)
    if (element) return element
  }
  const zoneId = node.closest("[data-zone-id]")?.getAttribute("data-zone-id")
  if (zoneId) return lookup.zoneById.get(zoneId) ?? null
  return null
}

export function BuyerMapZoomDock({
  onZoomIn,
  onZoomOut,
  onReset,
  className,
  size = "default",
  showReset = true,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  className?: string
  size?: "default" | "lg"
  showReset?: boolean
}) {
  const large = size === "lg"
  const buttonClass = large
    ? "flex size-12 min-h-12 min-w-12 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-md hover:bg-accent"
    : "flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
  const iconClass = large ? "size-6" : "size-4"

  return (
    <div
      className={cn(
        large
          ? "absolute right-4 bottom-4 z-10 flex flex-col gap-2"
          : "absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-row items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1 backdrop-blur-md",
        className,
      )}
      role="toolbar"
      aria-label="Zoom del mapa"
    >
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Acercar"
        className={buttonClass}
      >
        <Plus className={iconClass} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Alejar"
        className={buttonClass}
      >
        <Minus className={iconClass} aria-hidden="true" />
      </button>
      {showReset ? (
        <button
          type="button"
          onClick={onReset}
          title="Restablecer vista"
          aria-label="Restablecer vista"
          className={buttonClass}
        >
          <Locate className={iconClass} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
