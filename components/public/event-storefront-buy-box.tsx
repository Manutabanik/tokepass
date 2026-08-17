"use client"

import { Calendar, Lock, MapPin, ShieldCheck } from "lucide-react"

import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export function EventStorefrontBuyBox({
  price,
  dateLabel,
  venueLabel,
  limited,
  onAcquire,
}: {
  price: number | null
  dateLabel: string
  venueLabel: string
  limited: boolean
  onAcquire: () => void
}) {
  return (
    <div
      className={cn(
        "hidden w-full flex-col self-start rounded-2xl border border-border/50 bg-card/70 p-6 shadow-2xl backdrop-blur-xl lg:sticky lg:top-24 lg:flex",
      )}
    >
      <div className="mb-5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            limited
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {limited ? "Disponibilidad limitada" : "Venta activa"}
        </span>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Entradas desde
      </p>
      <p className="mt-1 text-4xl font-black tracking-tight text-foreground tabular-nums">
        {price != null ? formatCurrency(price) : "Consultar"}
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

      <button
        type="button"
        onClick={onAcquire}
        className={cn(
          "mt-6 w-full rounded-xl bg-primary py-4 text-center text-lg font-bold text-primary-foreground",
          "shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_30%,transparent)]",
          "transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90",
          "hover:shadow-[0_0_30px_color-mix(in_srgb,var(--primary)_50%,transparent)]",
        )}
      >
        Adquirir Entradas
      </button>

      <div className="mt-4 flex flex-col items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Compra 100% segura y encriptada
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Protegido por Tokepass
        </p>
      </div>
    </div>
  )
}
