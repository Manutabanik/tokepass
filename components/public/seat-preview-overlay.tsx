"use client"

import { Button } from "@/components/ui/button"
import { formatTicketPrice } from "@/lib/format"
import type { StorefrontLayoutSeat, StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export type BuyerPlacePreview = {
  sectorName: string
  placeName: string
  price: number
  selected: boolean
  focusId: string
  increment: boolean
  item: StorefrontSelectedItem
  layoutSeat?: StorefrontLayoutSeat
}

export function SeatPreviewOverlay({
  preview,
  pending = false,
  onCancel,
  onConfirm,
}: {
  preview: BuyerPlacePreview
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmLabel = preview.selected ? "Quitar" : "Seleccionar"
  return (
    <div className="absolute inset-0 z-30">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar previsualización"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-preview-title"
        className="absolute inset-0 m-auto h-fit w-11/12 max-w-sm rounded-xl bg-background p-6 shadow-2xl"
      >
        <p className="text-sm font-semibold text-muted-foreground">
          {preview.sectorName}
        </p>
        <h2
          id="seat-preview-title"
          className="mt-1 text-2xl font-bold tracking-tight text-foreground"
        >
          {preview.placeName}
        </h2>
        <p className="mt-4 text-4xl font-black tabular-nums text-foreground">
          {formatTicketPrice(preview.price)}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
            className={cn(tapFeedbackClass, "h-12 min-h-12 w-full text-base font-semibold")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              tapFeedbackClass,
              "h-12 min-h-12 w-full text-base font-bold text-white",
              preview.selected
                ? "bg-zinc-800 hover:bg-zinc-900"
                : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
