"use client"

import type { UseFormReturn } from "react-hook-form"

import { useEventCapacity } from "@/hooks/use-event-capacity"
import { eventCapacityOverflowMessage } from "@/lib/inventory/capacity-budget"
import { formatNumber } from "@/lib/format"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function CapacityThermometer({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
  const capacity = useEventCapacity(form)
  const used = capacity.totalAllocated
  const venueMax = capacity.effectiveMaxCapacity
  const percent =
    venueMax > 0 ? Math.min(100, Math.round((used / venueMax) * 100)) : 0
  const totalLabel = venueMax > 0 ? formatNumber(venueMax) : "—"

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Capacidad del recinto</span>
        <span className="font-medium tabular-nums text-foreground">
          {formatNumber(used)} / {totalLabel}
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={venueMax || used}
        aria-valuenow={used}
        aria-label="Stock ocupado sobre capacidad del recinto"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color]",
            capacity.exceeded
              ? "bg-amber-500"
              : capacity.remaining > 0
                ? "bg-emerald-600 dark:bg-emerald-400"
                : "bg-zinc-700 dark:bg-zinc-300",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {capacity.exceeded ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          {eventCapacityOverflowMessage(capacity)}
        </p>
      ) : capacity.remaining > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Aforo disponible: {formatNumber(capacity.remaining)} lugares
        </p>
      ) : null}
    </section>
  )
}
