"use client"

import { ShieldCheck } from "lucide-react"

import { venueCapacityBudget } from "@/lib/inventory/capacity-budget"
import { formatNumber } from "@/lib/format"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function CapacityBudgetBar({
  venueCapacity,
  tickets,
}: {
  venueCapacity: number | undefined
  tickets: EventFormValues["tickets"]
}) {
  const budget = venueCapacityBudget(venueCapacity, tickets)
  const usedRatio =
    budget.max > 0 ? Math.min(1, budget.allocated / budget.max) : 0
  const overflow = budget.max > 0 && budget.allocated > budget.max

  return (
    <div className="sticky top-0 z-20 rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-md">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Presupuesto de capacidad del recinto
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {budget.max > 0
              ? `${formatNumber(budget.allocated)} de ${formatNumber(budget.max)} lugares asignados. Quedan ${formatNumber(budget.remaining)}.`
              : "Definí la capacidad del lugar en Mapa y Sectores para controlar el stock."}
          </p>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budget.max || 0}
        aria-valuenow={budget.allocated}
        aria-label="Capacidad asignada del recinto"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            overflow
              ? "bg-red-500"
              : usedRatio >= 0.9
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          style={{ width: `${Math.round(usedRatio * 100)}%` }}
        />
      </div>
      {overflow ? (
        <p className="mt-2 text-xs text-red-500" role="alert">
          El stock de entradas generales supera el aforo del recinto.
        </p>
      ) : null}
    </div>
  )
}
