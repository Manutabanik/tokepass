"use client"

import { Clock, LayoutList, Pencil } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { DraftCard, DraftHint } from "./event-editor-v2-ui"
import {
  buildInventorySummaryRows,
  inventorySummaryTotals,
  type InventorySummaryKind,
  type InventorySummaryRow,
} from "@/lib/events/inventory-summary-v2"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  draftNumberValue,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

const KIND_BADGE: Record<
  InventorySummaryKind,
  { label: string; className: string }
> = {
  general: {
    label: "General",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  extra: {
    label: "Extra",
    className:
      "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  },
  mapa: {
    label: "Mapa",
    className:
      "bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  },
}

export function InventorySummaryTable() {
  const { control, getValues, setValue } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const extras = useWatch({ control, name: "extras" }) ?? []
  const sectors = useWatch({ control, name: "seatingMap.sectors" }) ?? []
  const rows = buildInventorySummaryRows({ tickets, extras, sectors })
  const totals = inventorySummaryTotals(rows)

  function writePrice(row: InventorySummaryRow, next: number) {
    const price = Math.max(0, next)
    if (row.source.field === "seatingMap.sectors") {
      const seatingMap = getValues("seatingMap")
      const currentSectors = Array.isArray(seatingMap.sectors)
        ? [...seatingMap.sectors]
        : []
      const current = currentSectors[row.source.index]
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return
      }
      currentSectors[row.source.index] = { ...current, price }
      setValue(
        "seatingMap",
        { ...seatingMap, sectors: currentSectors },
        { shouldDirty: true, shouldTouch: true },
      )
      if (row.source.ticketIndex != null) {
        setValue(`tickets.${row.source.ticketIndex}.price`, price, {
          shouldDirty: true,
          shouldTouch: true,
        })
      }
      return
    }
    setValue(`${row.source.field}.${row.source.index}.price`, price, {
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  function writeStock(row: InventorySummaryRow, next: number) {
    if (row.stockReadOnly || row.source.field === "seatingMap.sectors") return
    setValue(
      `${row.source.field}.${row.source.index}.stock`,
      Math.max(0, next),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  return (
    <DraftCard>
      <div className="mb-4 flex items-center gap-2">
        <LayoutList className="size-4 text-emerald-400" aria-hidden />
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          Resumen general
        </h2>
      </div>
      <DraftHint>
        Ledger del inventario. Cambiá precio o stock acá y se actualizan las
        tarjetas, el termómetro y el JSON del borrador.
      </DraftHint>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-800">
          Todavía no hay entradas, extras ni sectores para resumir.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                <th className="pb-2 pr-3 font-semibold">Nombre</th>
                <th className="pb-2 pr-3 font-semibold">Precio</th>
                <th className="pb-2 pr-3 font-semibold">Stock</th>
                <th className="pb-2 text-right font-semibold">Recaudación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = KIND_BADGE[row.type]
                return (
                  <tr
                    key={row.key}
                    className="border-b border-slate-200/80 last:border-b-0 dark:border-gray-800"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                        <span className="truncate font-medium text-slate-800 dark:text-zinc-100">
                          {row.name}
                        </span>
                        {row.hasPresale ? <PresaleClock /> : null}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <LedgerNumberInput
                        value={row.price}
                        ariaLabel={`Precio de ${row.name}`}
                        onChange={(value) => writePrice(row, value)}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <LedgerNumberInput
                        value={row.stock}
                        disabled={row.stockReadOnly}
                        ariaLabel={`Stock de ${row.name}`}
                        onChange={(value) => writeStock(row, value)}
                      />
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-zinc-200">
                      {formatCurrency(row.price * row.stock)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-300 text-sm font-semibold dark:border-gray-700">
                <td className="pt-3 pr-3 text-xs uppercase tracking-wide text-gray-500" colSpan={2}>
                  Total proyectado
                </td>
                <td className="pt-3 pr-3 tabular-nums text-slate-800 dark:text-zinc-100">
                  {formatNumber(totals.stock)}
                </td>
                <td className="pt-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totals.revenue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </DraftCard>
  )
}

function PresaleClock() {
  return (
    <span className="group/presale relative inline-flex shrink-0">
      <Clock
        className="size-3.5 text-amber-500"
        aria-label="Preventa programada"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium whitespace-nowrap text-white opacity-0 shadow-sm transition-opacity group-hover/presale:opacity-100 group-focus-within/presale:opacity-100"
      >
        Preventa programada
      </span>
    </span>
  )
}

function LedgerNumberInput({
  value,
  disabled = false,
  ariaLabel,
  onChange,
}: {
  value: number
  disabled?: boolean
  ariaLabel: string
  onChange: (value: number) => void
}) {
  return (
    <span className="group relative inline-flex min-w-[5.5rem] items-center">
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        disabled={disabled}
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(draftNumberValue(event.target.value))}
        className={cn(
          "w-full bg-transparent px-0 py-1 text-sm tabular-nums outline-none",
          "border-0 border-b border-dashed border-gray-600",
          "focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50",
          disabled &&
            "cursor-not-allowed border-transparent text-muted-foreground",
        )}
      />
      {disabled ? null : (
        <Pencil
          className="pointer-events-none absolute -right-4 size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </span>
  )
}
