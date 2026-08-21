"use client"

import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export type BuyerMapHoverItem = {
  sectorName: string
  seatNumber?: number | string | null
  row?: string | null
  price: number
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
    </div>
  )
}

export function clampTooltipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const tooltipWidth = 196
  const tooltipHeight = 58
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
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "absolute right-3 bottom-3 z-20 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/60 p-1 backdrop-blur-md",
        className,
      )}
    >
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Acercar"
        className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-foreground hover:bg-white/10"
      >
        +
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Alejar"
        className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-foreground hover:bg-white/10"
      >
        -
      </button>
      <button
        type="button"
        onClick={onReset}
        title="Restablecer vista"
        aria-label="Restablecer vista"
        className="flex size-8 items-center justify-center rounded-lg text-xs text-muted-foreground hover:bg-white/10"
      >
        ↺
      </button>
    </div>
  )
}
