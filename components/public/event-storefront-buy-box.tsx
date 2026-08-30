"use client"

import { Calendar, Lock, MapPin } from "lucide-react"

import { TokepassGuaranteeBadge } from "@/components/shared/tokepass-guarantee-badge"
import { Button } from "@/components/ui/button"
import { CustomerFacingTicketPrice } from "@/components/public/customer-facing-price"
import { cn } from "@/lib/utils"

export function EventStorefrontBuyBox({
  price,
  dateLabel,
  venueLabel,
  limited,
  isOnline = false,
  soldOut = false,
  onAcquire,
}: {
  price: number | null
  dateLabel: string
  venueLabel: string
  limited: boolean
  isOnline?: boolean
  soldOut?: boolean
  onAcquire: (event: React.MouseEvent) => void
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-2xl border border-black/5 bg-white/60 p-6 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/40 dark:shadow-2xl",
      )}
    >
      <div className="mb-5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            soldOut
              ? "border-border bg-muted text-muted-foreground"
              : limited
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {soldOut
            ? "Agotado"
            : limited
              ? "¡Quedan pocas entradas!"
              : "Venta activa"}
        </span>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {price === 0 ? "Precio" : "Entradas desde"}
      </p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-4xl font-black tracking-tight text-foreground tabular-nums">
        {price == null
          ? "Ver entradas"
          : price === 0
            ? "Entrada gratuita"
            : (
              <CustomerFacingTicketPrice price={price} />
            )}
      </p>

      <ul className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-5">
        {dateLabel ? (
          <li className="flex min-w-0 items-start gap-2.5 text-sm text-muted-foreground">
            <Calendar
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="min-w-0 leading-snug text-foreground">
              {dateLabel}
            </span>
          </li>
        ) : null}
        {venueLabel ? (
          <li className="flex min-w-0 items-start gap-2.5 text-sm text-muted-foreground">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="min-w-0 leading-snug text-foreground">
              {venueLabel}
            </span>
          </li>
        ) : null}
      </ul>

      <Button
        type="button"
        size="storefront"
        disabled={soldOut}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (soldOut) return
          onAcquire(event)
        }}
        className={cn(
          "mt-6 h-14 w-full rounded-xl bg-emerald-500 text-lg text-slate-950",
          "shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400",
          soldOut &&
            "cursor-not-allowed bg-muted text-muted-foreground shadow-none hover:bg-muted",
        )}
      >
        {soldOut ? "Agotado" : isOnline ? "Elegir acceso" : "Elegir entradas"}
      </Button>

      <div className="mt-4 flex flex-col items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Compra 100% segura y encriptada
        </p>
        <TokepassGuaranteeBadge variant="full" isOnline={isOnline} className="w-full" />
      </div>
    </div>
  )
}
