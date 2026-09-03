"use client"

import { useState } from "react"

import { QuantityCounter } from "@/components/public/quantity-counter"
import { Button } from "@/components/ui/button"
import { clampGeneralZoneQuantity } from "@/lib/checkout-limits"
import { formatCartTotal, formatTicketPrice } from "@/lib/format"
import { cn, tapFeedbackClass } from "@/lib/utils"

export type ZoneQuantityDraft = {
  zoneId: string
  zoneName: string
  unitPrice: number
  /** Cuántas entradas de esta zona ya están en el carrito. */
  current: number
  /** Tope real: el menor entre el stock del sector y el límite por comprador. */
  max: number
}

/**
 * Elección de cantidad para una zona de acceso general.
 *
 * En un sector sin butacas el comprador no elige un lugar, elige cuántas
 * entradas quiere: antes cada tap sumaba una sola y el segundo tap solo servía
 * para quitarla, así que llevarse cuatro entradas era imposible desde el plano.
 *
 * Va abajo y no en el centro porque el pulgar llega ahí y porque el plano
 * queda visible arriba: el comprador sigue viendo qué sector eligió mientras
 * decide la cantidad.
 */
export function ZoneQuantitySheet({
  draft,
  pending = false,
  onCancel,
  onConfirm,
}: {
  draft: ZoneQuantityDraft
  pending?: boolean
  onCancel: () => void
  onConfirm: (quantity: number) => void
}) {
  const inCart = draft.current > 0
  // Bajar a 0 solo tiene sentido para soltar lo que ya está en el carrito.
  const min = inCart ? 0 : Math.min(1, draft.max)
  // Se monta al abrir y se desmonta al cerrar, así que el estado arranca
  // limpio en cada zona. El `key` del llamador cubre el caso de reapertura.
  const [quantity, setQuantity] = useState(() =>
    clampGeneralZoneQuantity(draft.current > 0 ? draft.current : 1, {
      max: draft.max,
      allowZero: draft.current > 0,
    }),
  )

  const subtotal = draft.unitPrice * quantity
  const step = (next: number) =>
    clampGeneralZoneQuantity(next, { max: draft.max, allowZero: inCart })
  const confirmLabel =
    quantity <= 0
      ? "Quitar del carrito"
      : inCart
        ? "Actualizar cantidad"
        : "Agregar al carrito"

  return (
    <div className="absolute inset-0 z-30">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar selección de cantidad"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="zone-quantity-title"
        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="zone-quantity-title"
                className="break-words text-lg font-black leading-tight tracking-tight text-foreground"
              >
                {draft.zoneName}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {draft.unitPrice > 0
                  ? `${formatTicketPrice(draft.unitPrice)} por entrada`
                  : "Entrada sin cargo"}
              </p>
            </div>
            <p className="shrink-0 text-right text-xl font-bold tabular-nums text-foreground">
              {formatCartTotal(subtotal)}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Entradas</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {quantityHint(quantity, draft.max)}
              </p>
            </div>
            <QuantityCounter
              quantity={quantity}
              min={min}
              max={draft.max}
              disabled={pending}
              onDecrease={() => setQuantity((value) => step(value - 1))}
              onIncrease={() => setQuantity((value) => step(value + 1))}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              disabled={pending || draft.max <= 0}
              onClick={() => onConfirm(quantity)}
              className={cn(
                tapFeedbackClass,
                "h-12 min-h-12 w-full text-base font-bold text-white sm:flex-1",
                quantity <= 0
                  ? "bg-zinc-800 hover:bg-zinc-900"
                  : "bg-emerald-600 hover:bg-emerald-700",
              )}
            >
              {confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onCancel}
              className={cn(
                tapFeedbackClass,
                "h-12 min-h-12 w-full text-base font-semibold sm:w-auto sm:px-6",
              )}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function quantityHint(quantity: number, max: number) {
  if (max <= 1) return "Último lugar disponible"
  if (quantity >= max) return `Llegaste al máximo (${max})`
  return `Máximo ${max}`
}
