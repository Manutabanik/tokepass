"use client"

import { Clock, LayoutList, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { useDraftArchetype } from "./event-editor-v2-archetype"
import { EventEditorV2SlotSelect } from "./event-editor-v2-slot-select"
import { DraftCard, DraftHint } from "./event-editor-v2-ui"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  buildInventorySummaryRows,
  inventorySummaryTotals,
  type InventorySummaryKind,
  type InventorySummaryRow,
} from "@/lib/events/inventory-summary-v2"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  formatDraftTicketValidDaysBadge,
  hasMultipleDraftSlots,
  listDraftScheduleSlots,
} from "@/lib/events/draft-schedule-slots-v2"
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
  const { labels } = useDraftArchetype()
  const { control, getValues, setValue } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const extras = useWatch({ control, name: "extras" }) ?? []
  const sectors = useWatch({ control, name: "seatingMap.sectors" }) ?? []
  const seatingMaps = useWatch({ control, name: "seatingMaps" }) ?? []
  const schedule = useWatch({ control, name: "schedule" }) ?? []
  const slotOptions = listDraftScheduleSlots(schedule)
  const showSlots = hasMultipleDraftSlots(schedule)
  const rows = buildInventorySummaryRows({
    tickets,
    extras,
    sectors,
    seatingMaps,
  })
  const totals = inventorySummaryTotals(rows)

  function writePrice(row: InventorySummaryRow, next: number) {
    const price = Math.max(0, next)
    if (row.source.field === "seatingMaps") {
      const maps = [...(getValues("seatingMaps") ?? [])]
      const instance = maps[row.source.mapIndex]
      if (!instance || typeof instance !== "object") return
      const mapConfig =
        instance.mapConfig &&
        typeof instance.mapConfig === "object" &&
        !Array.isArray(instance.mapConfig)
          ? { ...(instance.mapConfig as Record<string, unknown>) }
          : {}
      const currentSectors = Array.isArray(mapConfig.sectors)
        ? [...mapConfig.sectors]
        : []
      const current = currentSectors[row.source.sectorIndex]
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return
      }
      const sector: Record<string, unknown> = {
        ...(current as Record<string, unknown>),
        price,
      }
      currentSectors[row.source.sectorIndex] = sector
      const pricing =
        instance.pricing &&
        typeof instance.pricing === "object" &&
        !Array.isArray(instance.pricing)
          ? { ...(instance.pricing as Record<string, unknown>) }
          : {}
      const sectorPrices =
        pricing.sectorPrices &&
        typeof pricing.sectorPrices === "object" &&
        !Array.isArray(pricing.sectorPrices)
          ? { ...(pricing.sectorPrices as Record<string, unknown>) }
          : {}
      const sectorId =
        typeof sector.id === "string" ? sector.id.trim() : ""
      if (sectorId) sectorPrices[sectorId] = price
      maps[row.source.mapIndex] = {
        ...instance,
        mapConfig: { ...mapConfig, sectors: currentSectors },
        pricing: { ...pricing, sectorPrices },
      }
      setValue("seatingMaps", maps, { shouldDirty: true, shouldTouch: true })
      if (row.source.ticketIndex != null) {
        setValue(`tickets.${row.source.ticketIndex}.price`, price, {
          shouldDirty: true,
          shouldTouch: true,
        })
      }
      return
    }
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
    if (
      row.stockReadOnly ||
      row.source.field === "seatingMap.sectors" ||
      row.source.field === "seatingMaps"
    ) {
      return
    }
    setValue(
      `${row.source.field}.${row.source.index}.stock`,
      Math.max(0, next),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  function ticketValidDaysBadge(row: InventorySummaryRow): string {
    if (schedule.length <= 1 || row.source.field !== "tickets") return ""
    return formatDraftTicketValidDaysBadge(
      schedule,
      tickets[row.source.index]?.validDayIds,
    )
  }

  function writeSlotId(row: InventorySummaryRow, slotId: string) {
    if (row.source.field !== "tickets") return
    setValue(`tickets.${row.source.index}.slotId`, slotId, {
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  function removeLedgerRow(row: InventorySummaryRow) {
    const source = row.source
    const ticketIndex =
      source.field === "tickets"
        ? source.index
        : source.field === "seatingMaps" || source.field === "seatingMap.sectors"
          ? source.ticketIndex
          : null
    if (ticketIndex != null) {
      const current = getValues("tickets") ?? []
      setValue(
        "tickets",
        current.filter((_, index) => index !== ticketIndex),
        { shouldDirty: true, shouldTouch: true },
      )
    }
    if (source.field === "seatingMaps") {
      const maps = [...(getValues("seatingMaps") ?? [])]
      const instance = maps[source.mapIndex]
      if (!instance || typeof instance !== "object") return
      const mapConfig =
        instance.mapConfig &&
        typeof instance.mapConfig === "object" &&
        !Array.isArray(instance.mapConfig)
          ? { ...(instance.mapConfig as Record<string, unknown>) }
          : {}
      const sectors = Array.isArray(mapConfig.sectors)
        ? mapConfig.sectors.filter((_, index) => index !== source.sectorIndex)
        : []
      maps[source.mapIndex] = {
        ...instance,
        mapConfig: { ...mapConfig, sectors },
      }
      setValue("seatingMaps", maps, { shouldDirty: true, shouldTouch: true })
      return
    }
    if (source.field === "seatingMap.sectors") {
      const seatingMap = getValues("seatingMap")
      const sectors = Array.isArray(seatingMap.sectors)
        ? seatingMap.sectors.filter((_, index) => index !== source.index)
        : []
      setValue(
        "seatingMap",
        { ...seatingMap, sectors },
        { shouldDirty: true, shouldTouch: true },
      )
    }
  }

  return (
    <DraftCard className="w-full min-w-0">
      <Accordion className="w-full">
        <AccordionItem value="ledger" className="border-0">
          <AccordionTrigger className="py-1 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3">
              <span className="flex min-w-0 items-center gap-2">
                <LayoutList className="size-4 shrink-0 text-emerald-400" aria-hidden />
                <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                  Resumen y Proyección de Recaudación
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totals.revenue)}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
      <DraftHint>
        Ledger del inventario. Cambiá precio o stock acá y se actualizan las
        tarjetas, el termómetro y el JSON del borrador.
      </DraftHint>

      {rows.length === 0 ? (
        <p className="mt-5 flex-grow rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-800">
          Todavía no hay {labels.tickets.toLowerCase()}, extras ni sectores para
          resumir.
        </p>
      ) : (
        <div className="no-scrollbar mt-5 max-h-96 overflow-y-auto">
          <ul className="space-y-3 sm:hidden">
            {rows.map((row) => {
              const badge = KIND_BADGE[row.type]
              const dayBadge = ticketValidDaysBadge(row)
              return (
                <li
                  key={row.key}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-gray-800 dark:bg-gray-950/40"
                >
                  <div className="flex min-w-0 flex-col gap-1">
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
                    {dayBadge ? (
                      <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                        {dayBadge}
                      </span>
                    ) : null}
                  </div>
                  {showSlots && row.source.field === "tickets" ? (
                    <EventEditorV2SlotSelect
                      value={String(tickets[row.source.index]?.slotId ?? "")}
                      options={slotOptions}
                      ariaLabel={`Turno de ${row.name}`}
                      onChange={(slotId) => writeSlotId(row, slotId)}
                    />
                  ) : null}
                  <div className="grid grid-cols-1 gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                        Precio
                      </span>
                      <LedgerNumberInput
                        stacked
                        value={row.price}
                        ariaLabel={`Precio de ${row.name}`}
                        onChange={(value) => writePrice(row, value)}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                        Stock
                      </span>
                      <LedgerNumberInput
                        stacked
                        value={row.stock}
                        disabled={row.stockReadOnly}
                        ariaLabel={`Stock de ${row.name}`}
                        onChange={(value) => writeStock(row, value)}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm tabular-nums text-slate-700 dark:text-zinc-200">
                      Recaudación {formatCurrency(row.price * row.stock)}
                    </p>
                    {row.type === "mapa" ? (
                      <LedgerMapRowMenu
                        name={row.name}
                        onRemove={() => removeLedgerRow(row)}
                      />
                    ) : null}
                  </div>
                </li>
              )
            })}
            <li className="flex items-center justify-between rounded-xl border border-slate-300 px-3 py-3 text-sm font-semibold dark:border-gray-700">
              <span className="text-xs tracking-wide text-gray-500 uppercase">
                Total · {formatNumber(totals.stock)}
              </span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totals.revenue)}
              </span>
            </li>
          </ul>

          <div className="hidden overflow-x-auto px-1 pb-2 sm:block">
            <table className="w-full min-w-[36rem] table-auto text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="pb-2 pr-3 font-semibold">Nombre</th>
                  {showSlots ? (
                    <th className="pb-2 pr-3 font-semibold">Turno</th>
                  ) : null}
                  <th className="pb-2 pr-3 font-semibold">Precio</th>
                  <th className="pb-2 pr-3 font-semibold">Stock</th>
                  <th className="pb-2 text-right font-semibold">Recaudación</th>
                  <th className="pb-2 pl-2 text-right font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const badge = KIND_BADGE[row.type]
                  const dayBadge = ticketValidDaysBadge(row)
                  return (
                    <tr
                      key={row.key}
                      className="border-b border-slate-200/80 last:border-b-0 dark:border-gray-800"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex min-w-0 flex-col gap-1">
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
                          {dayBadge ? (
                            <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                              {dayBadge}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {showSlots ? (
                        <td className="py-2.5 pr-3">
                          {row.source.field === "tickets" ? (
                            <EventEditorV2SlotSelect
                              compact
                              value={String(tickets[row.source.index]?.slotId ?? "")}
                              options={slotOptions}
                              ariaLabel={`Turno de ${row.name}`}
                              onChange={(slotId) => writeSlotId(row, slotId)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      ) : null}
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
                      <td className="py-2.5 pl-2 text-right">
                        {row.type === "mapa" ? (
                          <LedgerMapRowMenu
                            name={row.name}
                            onRemove={() => removeLedgerRow(row)}
                          />
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 text-sm font-semibold dark:border-gray-700">
                  <td
                    className="pt-3 pr-3 text-xs uppercase tracking-wide text-gray-500"
                    colSpan={showSlots ? 3 : 2}
                  >
                    Total proyectado
                  </td>
                  <td className="pt-3 pr-3 tabular-nums text-slate-800 dark:text-zinc-100">
                    {formatNumber(totals.stock)}
                  </td>
                  <td className="pt-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totals.revenue)}
                  </td>
                  <td className="pt-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </DraftCard>
  )
}

function LedgerMapRowMenu({
  name,
  onRemove,
}: {
  name: string
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={`Acciones de ${name}`}
        className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem
          className="text-red-600 dark:text-red-400"
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  stacked = false,
  ariaLabel,
  onChange,
}: {
  value: number
  disabled?: boolean
  stacked?: boolean
  ariaLabel: string
  onChange: (value: number) => void
}) {
  return (
    <span
      className={cn(
        "group relative inline-flex items-center",
        stacked ? "w-full" : "min-w-[5.5rem]",
      )}
    >
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
          "w-full tabular-nums outline-none",
          stacked
            ? "h-12 min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-base dark:border-gray-700 dark:bg-gray-900/80"
            : "border-0 border-b border-dashed border-gray-600 bg-transparent px-0 py-1 text-sm",
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
