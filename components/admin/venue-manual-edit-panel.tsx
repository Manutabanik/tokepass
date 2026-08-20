"use client"

import { PencilLine } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function VenueManualEditPanel({
  title = "Edición Manual",
  description = "Los cambios se ven al instante en el mapa y en la estructura del recinto.",
  label,
  row,
  number,
  showRow = false,
  showNumber = false,
  onLabelChange,
  onRowChange,
  onNumberChange,
}: {
  title?: string
  description?: string
  label: string
  row?: string
  number?: string
  showRow?: boolean
  showNumber?: boolean
  onLabelChange: (next: string) => void
  onRowChange?: (next: string) => void
  onNumberChange?: (next: string) => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <PencilLine className="size-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="space-y-1.5">
        <Label
          htmlFor="venue-manual-label"
          className="text-[11px] text-muted-foreground"
        >
          Etiqueta / Número de asiento
        </Label>
        <Input
          id="venue-manual-label"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="Ej. Fila A - Asiento 12"
        />
      </div>
      {showRow || showNumber ? (
        <div className="grid grid-cols-2 gap-2">
          {showRow ? (
            <div className="space-y-1.5">
              <Label
                htmlFor="venue-manual-row"
                className="text-[11px] text-muted-foreground"
              >
                Fila
              </Label>
              <Input
                id="venue-manual-row"
                value={row ?? ""}
                onChange={(event) => onRowChange?.(event.target.value)}
                placeholder="A"
              />
            </div>
          ) : null}
          {showNumber ? (
            <div className="space-y-1.5">
              <Label
                htmlFor="venue-manual-number"
                className="text-[11px] text-muted-foreground"
              >
                Número
              </Label>
              <Input
                id="venue-manual-number"
                inputMode="numeric"
                value={number ?? ""}
                onChange={(event) => onNumberChange?.(event.target.value)}
                placeholder="12"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
