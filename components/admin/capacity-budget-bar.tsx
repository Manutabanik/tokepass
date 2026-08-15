"use client"

import { Pencil, ShieldCheck } from "lucide-react"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const [editingAforo, setEditingAforo] = useState(false)
  const [draftAforo, setDraftAforo] = useState("")

  const usedRatio =
    capacity.effectiveMaxCapacity > 0
      ? Math.min(1, capacity.totalAllocated / capacity.effectiveMaxCapacity)
      : 0
  const barRatio = capacity.exceeded ? 1 : usedRatio

  function openAforoEditor() {
    setDraftAforo(
      String(
        capacity.customMaxCapacity ??
          capacity.effectiveMaxCapacity ??
          capacity.baseVenueCapacity ??
          "",
      ),
    )
    setEditingAforo(true)
  }

  function commitAforo() {
    if (draftAforo.trim() === "") {
      form.setValue("venue.customMaxCapacity", null, { shouldDirty: true })
      setEditingAforo(false)
      return
    }
    const next = Math.floor(Number(draftAforo))
    if (!Number.isFinite(next) || next < 1) {
      setEditingAforo(false)
      return
    }
    form.setValue("venue.customMaxCapacity", next, { shouldDirty: true })
    setEditingAforo(false)
  }

  return (
    <div className="sticky top-0 z-20 rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-md">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            capacity.exceeded
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
          )}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-sm font-semibold break-words text-foreground">
              Presupuesto de capacidad del recinto
            </p>
            {editingAforo ? (
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label="Aforo total del recinto"
                  value={draftAforo}
                  onChange={(event) => setDraftAforo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      commitAforo()
                    }
                    if (event.key === "Escape") {
                      setEditingAforo(false)
                    }
                  }}
                  className="h-11 min-h-11 w-full min-w-0 sm:w-28"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={commitAforo}
                  className="min-h-11 min-w-11 shrink-0"
                >
                  Aplicar
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 min-w-11 justify-start text-xs text-muted-foreground sm:justify-center"
                onClick={openAforoEditor}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Ajustar Aforo Total
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {capacity.effectiveMaxCapacity > 0
              ? `${formatNumber(capacity.totalAllocated)} de ${formatNumber(capacity.effectiveMaxCapacity)} lugares asignados`
              : "Definí la capacidad del lugar en Mapa y Sectores para controlar el stock."}
          </p>
          {capacity.customMaxCapacity != null &&
          capacity.customMaxCapacity > capacity.baseVenueCapacity ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Aforo expandido. Oficial del recinto:{" "}
              {formatNumber(capacity.baseVenueCapacity)} (mapa:{" "}
              {formatNumber(capacity.mapAllocatedCapacity)}).
            </p>
          ) : null}
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity.effectiveMaxCapacity || 0}
        aria-valuenow={capacity.totalAllocated}
        aria-label="Capacidad asignada del recinto"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            capacity.exceeded
              ? "bg-destructive"
              : usedRatio >= 0.9
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          style={{ width: `${Math.round(barRatio * 100)}%` }}
        />
      </div>
      {capacity.exceeded ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          Excedido por {formatNumber(capacity.overflow)} lugares
        </p>
      ) : capacity.effectiveMaxCapacity > 0 && capacity.remaining > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Quedan {formatNumber(capacity.remaining)}.
        </p>
      ) : null}
    </div>
  )
}
