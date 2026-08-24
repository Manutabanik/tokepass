"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"

import { computeCapacityThermometer } from "@/lib/inventory/capacity-thermometer"
import { formatNumber } from "@/lib/format"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function CapacityThermometer({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
  const tickets = useWatch({ control: form.control, name: "tickets" }) ?? []
  const venueMap = useWatch({ control: form.control, name: "venue.venueMap" })
  const venueCapacity = useWatch({ control: form.control, name: "venue.capacity" })
  const customMaxCapacity = useWatch({
    control: form.control,
    name: "venue.customMaxCapacity",
  })
  const snap = computeCapacityThermometer({
    tickets,
    venueMap,
    venueCapacity,
    customMaxCapacity,
  })
  const percent = Math.min(100, Math.round(snap.ratio * 100))
  const totalLabel = snap.venueMax > 0 ? formatNumber(snap.venueMax) : "—"

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Capacidad del recinto</span>
        <span className="font-medium tabular-nums text-foreground">
          {formatNumber(snap.used)} / {totalLabel}
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={snap.venueMax || snap.used}
        aria-valuenow={snap.used}
        aria-label="Stock ocupado sobre capacidad del recinto"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color]",
            snap.overCapacity
              ? "bg-amber-500"
              : percent >= 90
                ? "bg-amber-400"
                : "bg-zinc-700 dark:bg-zinc-300",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {snap.overCapacity ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          El stock supera el aforo por {formatNumber(snap.overflow)} lugares.
        </p>
      ) : null}
    </section>
  )
}
