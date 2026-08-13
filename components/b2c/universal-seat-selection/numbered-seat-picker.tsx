"use client"

import type {
  UniversalNumberedSector,
  UniversalSeat,
} from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"

export function UniversalNumberedSeatPicker({
  sector,
  groupId,
  selectedSeatIds,
  onGroupChange,
  onToggleSeat,
}: {
  sector: UniversalNumberedSector
  groupId: string | null
  selectedSeatIds: string[]
  onGroupChange: (groupId: string) => void
  onToggleSeat: (seat: UniversalSeat) => void
}) {
  const group =
    sector.groups.find((item) => item.id === groupId) ?? sector.groups[0] ?? null
  const resolvedGroupId = group?.id ?? null

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400/90">
          Paso 2
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
          Elegí tu lugar exacto
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
          Primero la fila, mesa o bloque; después el asiento. Una ubicación por
          compra.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`group-${sector.id}`}
          className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Fila / Mesa / Bloque
        </label>
        <select
          id={`group-${sector.id}`}
          value={resolvedGroupId ?? ""}
          onChange={(event) => onGroupChange(event.target.value)}
          className={cn(
            "h-12 w-full appearance-none rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900",
            "outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500",
            "dark:border-zinc-800 dark:bg-zinc-900 dark:text-white",
          )}
        >
          {sector.groups.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {group ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-md bg-zinc-200 dark:bg-zinc-200" />{" "}
              Disponible
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-md bg-zinc-400 dark:bg-zinc-700" />{" "}
              Ocupado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-3 rounded-md"
                style={{ backgroundColor: sector.color }}
              />{" "}
              Seleccionado
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {group.seats.map((seat) => {
              const selected = selectedSeatIds.includes(seat.id)
              const locked =
                seat.status === "occupied" || seat.status === "blocked"
              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={locked}
                  aria-pressed={selected}
                  aria-label={`Asiento ${seat.label}${locked ? " no disponible" : ""}`}
                  onClick={() => onToggleSeat(seat)}
                  className={cn(
                    "relative flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold transition",
                    locked &&
                      "cursor-not-allowed bg-zinc-200 text-zinc-400 line-through opacity-70 dark:bg-zinc-800 dark:text-zinc-600",
                    !locked &&
                      !selected &&
                      "border border-zinc-300 bg-zinc-100 text-zinc-950 hover:bg-white dark:border-zinc-600 dark:bg-zinc-100",
                    selected && "text-zinc-950 shadow-lg",
                  )}
                  style={
                    selected
                      ? {
                          backgroundColor: sector.color,
                          boxShadow: `0 8px 24px ${sector.color}55`,
                        }
                      : undefined
                  }
                >
                  {seat.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}
