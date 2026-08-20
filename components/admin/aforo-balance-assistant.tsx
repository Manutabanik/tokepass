"use client"

import { Scale } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  physicalCapacity: number
  ticketStock: number
  difference: number
  onAssignRemaining: () => void
  onScaleToLimit: () => void
  canAssignRemaining: boolean
}

export function AforoBalanceAssistant({
  physicalCapacity,
  ticketStock,
  difference,
  onAssignRemaining,
  onScaleToLimit,
  canAssignRemaining,
}: Props) {
  if (physicalCapacity <= 0 || difference === 0) return null

  const over = difference < 0

  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3",
        over
          ? "border-destructive/35 bg-destructive/5"
          : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            over
              ? "bg-destructive/10 text-destructive"
              : "bg-background text-foreground",
          )}
        >
          <Scale className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm leading-6 text-foreground">
            {over ? (
              <>
                La suma de tus entradas ({formatNumber(ticketStock)}) supera la
                capacidad máxima del recinto ({formatNumber(physicalCapacity)}).
              </>
            ) : (
              <>
                Tenés {formatNumber(difference)} lugares configurados en el mapa
                sin asignar a ningún tipo de entrada.
              </>
            )}
          </p>
          {over ? (
            <Button type="button" variant="outline" size="sm" onClick={onScaleToLimit}>
              Ajustar stock al límite del mapa
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canAssignRemaining}
              onClick={onAssignRemaining}
            >
              Asignar restantes a Entrada General
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
