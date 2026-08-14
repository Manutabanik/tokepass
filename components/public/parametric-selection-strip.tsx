"use client"

import { ChevronLeft, Rows3, Table2 } from "lucide-react"

import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"

export type ParametricStripItem = {
  id: string
  label: string
  shortLabel: string
  status: SeatStatus
  seatingUnitId?: string | null
}

export type ParametricStripRow = {
  rowId: string
  rowLabel: string
  itemCount: number
  freeCount: number
}

const ROW_CHIP_WIDTH = 112
const ITEM_CHIP_WIDTH = 76

export function ParametricSelectionStrip({
  zoneName,
  color,
  rows,
  items,
  selectedRowId,
  selectedId,
  pending = false,
  onSelectRow,
  onBackToRows,
  onSelect,
}: {
  zoneName: string
  color: string
  rows: ParametricStripRow[]
  items: ParametricStripItem[]
  selectedRowId: string | null
  selectedId: string | null
  pending?: boolean
  onSelectRow: (rowId: string) => void
  onBackToRows: () => void
  onSelect: (item: ParametricStripItem) => void
}) {
  const activeRow = rows.find((row) => row.rowId === selectedRowId) ?? null
  const level: "rows" | "items" = activeRow ? "items" : "rows"

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        {level === "items" && rows.length > 1 ? (
          <button
            type="button"
            disabled={pending}
            onClick={onBackToRows}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-zinc-900 px-2.5 text-xs font-semibold text-zinc-200"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Filas
          </button>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
          <span style={{ color }}>{zoneName}</span>
          {activeRow ? (
            <span className="text-zinc-400">
              {" "}
              · {activeRow.rowLabel}
            </span>
          ) : null}
        </p>
      </div>

      {level === "rows" ? (
        <HorizontalChipList
          data={rows}
          itemWidth={ROW_CHIP_WIDTH}
          computeKey={(row) => row.rowId}
          render={(row) => {
            const selected = selectedRowId === row.rowId
            return (
              <button
                type="button"
                disabled={pending}
                onClick={() => onSelectRow(row.rowId)}
                className={cn(
                  "flex h-14 w-full flex-col items-start justify-center rounded-2xl border px-3 text-left",
                  selected
                    ? "border-cyan-400 bg-cyan-400/20 text-white"
                    : "border-white/10 bg-zinc-900 text-zinc-100",
                )}
              >
                <span className="inline-flex items-center gap-1 text-xs font-semibold">
                  <Rows3 className="size-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  {row.rowLabel}
                </span>
                <span className="text-[10px] font-medium text-zinc-400">
                  {row.freeCount} libres
                </span>
              </button>
            )
          }}
        />
      ) : (
        <HorizontalChipList
          data={items}
          itemWidth={ITEM_CHIP_WIDTH}
          computeKey={(item) => item.id}
          emptyLabel="Esta fila no tiene lugares publicados."
          render={(item) => {
            const taken = item.status !== "available"
            const selected = selectedId === item.id
            return (
              <button
                type="button"
                disabled={pending || taken}
                onClick={() => onSelect(item)}
                className={cn(
                  "flex h-14 w-full flex-col items-center justify-center rounded-2xl border text-center",
                  selected
                    ? "border-emerald-400 bg-emerald-500/20 text-white"
                    : taken
                      ? "cursor-not-allowed border-white/5 bg-zinc-900 text-zinc-600"
                      : "border-white/10 bg-zinc-900 text-zinc-100",
                )}
              >
                <Table2
                  className={cn(
                    "mb-0.5 size-3.5",
                    taken ? "text-zinc-600" : "text-cyan-300",
                  )}
                  aria-hidden="true"
                />
                <span className="text-[11px] font-semibold leading-none">
                  {item.shortLabel}
                </span>
              </button>
            )
          }}
        />
      )}
    </section>
  )
}

function HorizontalChipList<T>({
  data,
  itemWidth,
  computeKey,
  render,
  emptyLabel,
}: {
  data: T[]
  itemWidth: number
  computeKey: (item: T) => string
  render: (item: T) => React.ReactNode
  emptyLabel?: string
}) {
  if (data.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-zinc-500">
        {emptyLabel ?? "No hay filas en esta zona."}
      </p>
    )
  }

  return (
    <div className="flex h-14 w-full gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {data.map((item) => (
        <div
          key={computeKey(item)}
          className="h-14 shrink-0"
          style={{ width: itemWidth }}
        >
          {render(item)}
        </div>
      ))}
    </div>
  )
}
