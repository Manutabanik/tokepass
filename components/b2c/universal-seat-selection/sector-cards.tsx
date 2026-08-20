"use client"

import { Check } from "lucide-react"
import type { CSSProperties } from "react"

import { formatTicketPrice } from "@/lib/format"
import type { UniversalSector } from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"

export function UniversalSectorCards({
  sectors,
  selectedId,
  onSelect,
}: {
  sectors: UniversalSector[]
  selectedId: string | null
  onSelect: (sectorId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400/90">
          Paso 1
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
          Seleccioná tu zona
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sectors.map((sector) => {
          const active = selectedId === sector.id
          return (
            <button
              key={sector.id}
              type="button"
              onClick={() => onSelect(sector.id)}
              className={cn(
                "relative rounded-2xl border px-4 py-4 text-left transition",
                "bg-white hover:border-zinc-400 dark:bg-zinc-900/70 dark:hover:border-zinc-600",
                active
                  ? "border-transparent ring-2 ring-offset-2 ring-offset-slate-50 dark:ring-offset-zinc-950"
                  : "border-zinc-200 dark:border-zinc-800",
              )}
              style={
                active
                  ? ({
                      ["--tw-ring-color" as string]: sector.color,
                      boxShadow: `0 0 0 1px ${sector.color}66, 0 12px 40px ${sector.color}22`,
                    } as CSSProperties)
                  : undefined
              }
            >
              {active ? (
                <span
                  className="absolute right-3 top-3 grid size-6 place-items-center rounded-full text-zinc-950"
                  style={{ backgroundColor: sector.color }}
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
              ) : null}

              <span className="flex items-center gap-3">
                <span
                  className="size-3.5 shrink-0 rounded-full ring-2 ring-zinc-200 dark:ring-white/10"
                  style={{ backgroundColor: sector.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-zinc-900 dark:text-white">
                    {sector.name}
                  </span>
                  <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                    Precio desde {formatTicketPrice(sector.price)}
                  </span>
                  <span className="mt-2 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-500 dark:ring-zinc-800">
                    {sector.type === "general" ? "Sin numerar" : "Numerado"}
                    {typeof sector.availableCount === "number"
                      ? ` · ${sector.availableCount.toLocaleString("es-AR")} libres`
                      : ""}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
