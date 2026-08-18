"use client"

import { Users } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import { useEventCapacity } from "@/hooks/use-event-capacity"
import { formatNumber } from "@/lib/format"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function EventCapacityHeader({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
  const capacity = useEventCapacity(form)

  return (
    <div
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        capacity.exceeded
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-card text-foreground",
      )}
    >
      <Users className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Capacidad total{" "}
        <span className="font-semibold tabular-nums">
          {formatNumber(capacity.totalCapacity)}
        </span>
      </span>
      <span className="hidden text-muted-foreground sm:inline">
        {formatNumber(capacity.generalSectorCapacity)} sectores +{" "}
        {formatNumber(capacity.unboundGeneralCapacity)} libres +{" "}
        {formatNumber(capacity.mapAllocatedCapacity)} mapa
      </span>
    </div>
  )
}
