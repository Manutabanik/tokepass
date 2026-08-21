"use client"

import { Plus, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  patchRowSeatCount,
  resizeRowsConfig,
  totalSeatsFromRowsConfig,
} from "@/lib/seating/venue-rows-config"
import type { VenueRowConfig } from "@/types/venue-map"

export function VenueRowsConfigEditor({
  rowsConfig,
  onChange,
  maxRows = 80,
  maxSeats = 80,
}: {
  rowsConfig: VenueRowConfig[]
  onChange: (next: VenueRowConfig[]) => void
  maxRows?: number
  maxSeats?: number
}) {
  const totalCalculatedSeats = totalSeatsFromRowsConfig(rowsConfig)

  function handleAddRow() {
    if (rowsConfig.length >= maxRows) return
    onChange(resizeRowsConfig(rowsConfig, rowsConfig.length + 1, { maxRows, maxSeats }))
  }

  function handleRemoveRow(index: number) {
    if (rowsConfig.length <= 1) return
    onChange(rowsConfig.filter((_, current) => current !== index))
  }

  function handleSeatCountChange(index: number, seatCount: number) {
    onChange(patchRowSeatCount(rowsConfig, index, seatCount, maxSeats))
  }

  return (
    <div className="mt-1 space-y-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground">
          Configuración por Fila
        </p>
        <button
          type="button"
          onClick={handleAddRow}
          disabled={rowsConfig.length >= maxRows}
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
        >
          <Plus className="size-3" aria-hidden="true" />
          Agregar Fila
        </button>
      </div>

      <div className="custom-scrollbar max-h-52 space-y-2 overflow-y-auto pr-1">
        {rowsConfig.map((row, index) => (
          <div
            key={`${row.label ?? "row"}-${index}`}
            className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/30 p-2"
          >
            <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
              Fila {row.label || index + 1}
            </span>
            <Input
              type="number"
              min={1}
              max={maxSeats}
              value={row.seatCount}
              onChange={(event) =>
                handleSeatCountChange(index, Number(event.target.value) || 1)
              }
              placeholder="Cant. butacas"
              className="h-8 flex-1 rounded-lg px-2 text-xs"
            />
            <button
              type="button"
              onClick={() => handleRemoveRow(index)}
              disabled={rowsConfig.length <= 1}
              className="p-1 text-muted-foreground hover:text-rose-400 disabled:opacity-40"
              title="Eliminar fila"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-1 text-xs text-muted-foreground">
        <span>Capacidad total calculada:</span>
        <span className="font-bold text-emerald-400">
          {totalCalculatedSeats} {totalCalculatedSeats === 1 ? "lugar" : "lugares"}
        </span>
      </div>
    </div>
  )
}
