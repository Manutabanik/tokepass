"use client"

import { ShieldCheck } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import { useEventCapacity } from "@/hooks/use-event-capacity"
import { formatNumber } from "@/lib/format"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function CapacityBudgetBar({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
  const capacity = useEventCapacity(form)
  const usedRatio =
    capacity.totalCapacity > 0
      ? Math.min(1, capacity.totalAllocated / capacity.totalCapacity)
      : 0
  const barRatio = capacity.exceeded ? 1 : usedRatio

  return (
    <div className="sticky top-0 z-20 rounded-2xl border border-border bg-card/95 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            capacity.exceeded
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="min-w-0 text-sm font-semibold break-words text-foreground">
            Capacidad total del evento
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {capacity.totalCapacity > 0
              ? `${formatNumber(capacity.totalAllocated)} de ${formatNumber(capacity.totalCapacity)} lugares (sectores generales + mapa)`
              : "Agregá un sector general o dibujá el mapa para calcular el aforo."}
          </p>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity.totalCapacity || 0}
        aria-valuenow={capacity.totalAllocated}
        aria-label="Capacidad asignada del evento"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            capacity.exceeded
              ? "bg-destructive"
              : usedRatio >= 0.9
                ? "bg-amber-500"
                : "bg-primary",
          )}
          style={{ width: `${Math.round(barRatio * 100)}%` }}
        />
      </div>
      {capacity.exceeded ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          Excedido por {formatNumber(capacity.overflow)} lugares
        </p>
      ) : capacity.totalCapacity > 0 && capacity.remaining > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Quedan {formatNumber(capacity.remaining)}.
        </p>
      ) : null}
    </div>
  )
}
