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

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Capacidad del recinto
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generales {formatNumber(snap.generalStock)} + mapa{" "}
            {formatNumber(snap.mapCapacity)}
            {snap.venueMax > 0
              ? ` / ${formatNumber(snap.venueMax)} del lugar`
              : " · definí el aforo en Ubicación"}
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums text-foreground">
          {formatNumber(snap.used)}
          {snap.venueMax > 0 ? ` / ${formatNumber(snap.venueMax)}` : ""}
        </p>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={snap.venueMax || snap.used}
        aria-valuenow={snap.used}
        aria-label="Ocupación del recinto"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color]",
            snap.overCapacity
              ? "bg-amber-500"
              : percent >= 90
                ? "bg-amber-400"
                : "bg-emerald-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {snap.overCapacity ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          El stock supera el aforo del recinto por {formatNumber(snap.overflow)}{" "}
          lugares. Podés seguir, pero conviene bajar generales o ampliar el
          lugar.
        </p>
      ) : null}
    </section>
  )
}
