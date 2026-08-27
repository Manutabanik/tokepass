"use client"

import { ChevronDown, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import {
  DRAFT_FIELD_CLASS,
  DRAFT_TEXTAREA_CLASS,
  DraftFieldError,
  DraftFieldLabel,
  DraftHint,
} from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { EventEditorV2SlotSelect } from "./event-editor-v2-slot-select"
import { hasDraftPresale } from "@/lib/events/inventory-summary-v2"
import {
  draftScheduleDayChipLabel,
  hasMultipleDraftSlots,
  listDraftScheduleSlots,
} from "@/lib/events/draft-schedule-slots-v2"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  TICKET_COMMERCE_TYPES,
  TICKET_COMMERCE_TYPE_LABELS,
} from "@/lib/events/ticket-commerce-type"
import {
  applyDraftDayPriceStock,
  draftDayPriceStockRows,
  generalTicketNeedsDayPricing,
} from "@/lib/events/draft-day-priced-tickets"
import {
  draftNumberValue,
  isMapDraftTicket,
  toggleDraftLineupDay,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function DraftInventoryAccordionCard({
  name,
  index,
  emptyTitle,
  initialName,
  initialStartDate,
  initialEndDate,
  onRemove,
}: {
  name: "tickets" | "extras"
  index: number
  emptyTitle: string
  initialName?: string
  initialStartDate?: string
  initialEndDate?: string
  onRemove: () => void
}) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const schedule = useWatch({ control, name: "schedule" }) ?? []
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const slotId = useWatch({ control, name: `${name}.${index}.slotId` })
  const validDayIds =
    useWatch({ control, name: `${name}.${index}.validDayIds` }) ?? []
  const source = useWatch({ control, name: `${name}.${index}.source` })
  const sectorId = useWatch({ control, name: `${name}.${index}.sectorId` })
  const multiDay = name === "tickets" && schedule.length > 1
  const pricedByDay =
    name === "tickets" &&
    generalTicketNeedsDayPricing(
      { source, validDayIds, sectorId },
      schedule.length,
    )
  const slotOptions = listDraftScheduleSlots(schedule)
  const showSlots = name === "tickets" && hasMultipleDraftSlots(schedule)
  const itemName = useWatch({ control, name: `${name}.${index}.name` })
  const price = useWatch({ control, name: `${name}.${index}.price` })
  const stock = useWatch({ control, name: `${name}.${index}.stock` })
  const startDate = useWatch({ control, name: `${name}.${index}.startDate` })
  const endDate = useWatch({ control, name: `${name}.${index}.endDate` })
  const [isExpanded, setIsExpanded] = useState(
    () => !String(initialName ?? "").trim(),
  )
  const [showAdvanced, setShowAdvanced] = useState(() =>
    hasDraftPresale({
      startDate: initialStartDate,
      endDate: initialEndDate,
    }),
  )

  const itemErrors = errors[name]?.[index]
  const displayName = String(itemName ?? "").trim() || emptyTitle
  const priceValue = draftNumberValue(price)
  const stockValue = draftNumberValue(stock)
  const panelId = `event-v2-${name}-${index}-panel`
  const advancedId = `${panelId}-advanced`
  const scheduled = hasDraftPresale({ startDate, endDate })

  function toggleValidDay(dayId: string) {
    const nextDays = toggleDraftLineupDay(validDayIds, dayId)
    setValue(`${name}.${index}.validDayIds`, nextDays, {
      shouldDirty: true,
      shouldTouch: true,
    })
    setValue(`${name}.${index}.slotId`, nextDays.length === 1 ? nextDays[0] : "", {
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  function writeDayRate(dayId: string, field: "price" | "stock", raw: string) {
    const currentTickets = getValues("tickets")
    const current = currentTickets[index]
    if (!current || isMapDraftTicket(current)) return
    const rows = draftDayPriceStockRows(
      current,
      currentTickets,
      index,
      schedule,
    ).map((row) =>
      row.dayId === dayId
        ? { ...row, [field]: draftNumberValue(raw) }
        : row,
    )
    setValue(
      "tickets",
      applyDraftDayPriceStock(currentTickets, index, schedule, rows),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  return (
    <li className="w-full overflow-hidden rounded-xl border border-border/40 bg-transparent transition-all duration-200">
      <input type="hidden" {...register(`${name}.${index}.id`)} />
      <input type="hidden" {...register(`${name}.${index}.source`)} />
      <input type="hidden" {...register(`${name}.${index}.sectorId`)} />
      <input type="hidden" {...register(`${name}.${index}.layoutType`)} />
      <input type="hidden" {...register(`${name}.${index}.slotId`)} />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((open) => !open)}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100/80 dark:hover:bg-gray-800/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                isExpanded && "rotate-180",
              )}
              aria-hidden
            />
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100">
              {displayName}
            </span>
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
            Precio: {formatCurrency(priceValue)} | Stock: {formatNumber(stockValue)}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mr-2 size-11 shrink-0 text-muted-foreground hover:text-red-500"
          aria-label={`Eliminar ${displayName}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div
        id={panelId}
        aria-hidden={!isExpanded}
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded
            ? "mt-0 grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-4 pt-1 pb-4">
            <p className="text-xs text-muted-foreground tabular-nums sm:hidden">
              Precio: {formatCurrency(priceValue)} | Stock: {formatNumber(stockValue)}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_11rem_8rem_8rem]">
              <div className="grid gap-1.5">
                <DraftFieldLabel
                  htmlFor={`event-v2-${name}-${index}-name`}
                  required
                >
                  {name === "tickets" ? "¿Cómo se llama?" : "¿Cómo se llama el extra?"}
                </DraftFieldLabel>
                <Input
                  id={`event-v2-${name}-${index}-name`}
                  className={DRAFT_FIELD_CLASS}
                  placeholder={name === "tickets" ? "General" : "Cerveza"}
                  {...register(`${name}.${index}.name`)}
                />
                <DraftFieldError message={itemErrors?.name?.message} />
              </div>
              <div className="grid gap-1.5">
                <DraftFieldLabel htmlFor={`event-v2-${name}-${index}-ticketType`}>
                  Tipo de acceso
                </DraftFieldLabel>
                <select
                  id={`event-v2-${name}-${index}-ticketType`}
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.ticketType`)}
                >
                  {TICKET_COMMERCE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {TICKET_COMMERCE_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <DraftFieldLabel
                  htmlFor={`event-v2-${name}-${index}-price`}
                  required
                >
                  ¿Cuánto sale?
                </DraftFieldLabel>
                <Input
                  id={`event-v2-${name}-${index}-price`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.price`, {
                    setValueAs: draftNumberValue,
                  })}
                />
                <DraftFieldError message={itemErrors?.price?.message} />
              </div>
              <div className="grid gap-1.5">
                <DraftFieldLabel
                  htmlFor={`event-v2-${name}-${index}-stock`}
                  required
                >
                  ¿Cuántas hay?
                </DraftFieldLabel>
                <Input
                  id={`event-v2-${name}-${index}-stock`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`${name}.${index}.stock`, {
                    setValueAs: draftNumberValue,
                  })}
                />
                <DraftFieldError message={itemErrors?.stock?.message} />
              </div>
            </div>

            {pricedByDay ? (
              <div className="grid gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <DraftFieldLabel>
                  Precio y stock por día
                </DraftFieldLabel>
                <DraftHint>
                  El viernes y el sábado son entradas distintas. Cada jornada
                  tiene su precio y su cupo.
                </DraftHint>
                <div className="grid gap-2">
                  {tickets[index]
                    ? draftDayPriceStockRows(
                        tickets[index],
                        tickets,
                        index,
                        schedule,
                      ).map((row) => (
                    <div
                      key={row.dayId}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-end"
                    >
                      <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                        {row.label}
                      </p>
                      <div className="grid gap-1.5">
                        <DraftFieldLabel
                          htmlFor={`event-v2-${name}-${index}-price-${row.dayId}`}
                          required
                        >
                          Precio
                        </DraftFieldLabel>
                        <Input
                          id={`event-v2-${name}-${index}-price-${row.dayId}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          className={DRAFT_FIELD_CLASS}
                          value={row.price}
                          onChange={(event) =>
                            writeDayRate(row.dayId, "price", event.target.value)
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <DraftFieldLabel
                          htmlFor={`event-v2-${name}-${index}-stock-${row.dayId}`}
                          required
                        >
                          Stock
                        </DraftFieldLabel>
                        <Input
                          id={`event-v2-${name}-${index}-stock-${row.dayId}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          className={DRAFT_FIELD_CLASS}
                          value={row.stock}
                          onChange={(event) =>
                            writeDayRate(row.dayId, "stock", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  ))
                    : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <DraftFieldLabel
                htmlFor={`event-v2-${name}-${index}-description`}
                optional
              >
                Detalle
              </DraftFieldLabel>
              <Textarea
                id={`event-v2-${name}-${index}-description`}
                rows={2}
                className={DRAFT_TEXTAREA_CLASS}
                placeholder="Qué incluye o cómo se usa."
                {...register(`${name}.${index}.description`)}
              />
              <DraftHint>Una línea alcanza. El comprador lo ve en el checkout.</DraftHint>
              <DraftFieldError message={itemErrors?.description?.message} />
            </div>

            {multiDay ? (
              <div className="grid gap-1.5">
                <DraftFieldLabel optional>
                  ¿Para qué días es válida esta entrada?
                </DraftFieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {schedule.map((day, dayIndex) => {
                    const dayId = day.id?.trim()
                    if (!dayId) return null
                    const selected = validDayIds.includes(dayId)
                    return (
                      <button
                        key={dayId}
                        type="button"
                        onClick={() => toggleValidDay(dayId)}
                        aria-pressed={selected}
                        className={cn(
                          "min-h-11 rounded-full px-3 py-2 text-[11px] font-semibold transition-colors",
                          selected
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-slate-100 text-gray-500 hover:bg-slate-200 dark:bg-gray-900 dark:text-gray-400",
                        )}
                      >
                        {draftScheduleDayChipLabel(day, dayIndex)}
                      </button>
                    )
                  })}
                </div>
                <DraftHint>
                  {validDayIds.length === 1
                    ? "Este precio y stock son solo para ese día."
                    : "Un día = pase diario con su propio precio. Varios días = abono al mismo valor."}
                </DraftHint>
              </div>
            ) : null}

            {showSlots ? (
              <div className="grid gap-1.5">
                  <DraftFieldLabel htmlFor={`event-v2-${name}-${index}-slot`} optional>
                    ¿Para qué turno?
                  </DraftFieldLabel>
                <EventEditorV2SlotSelect
                  value={String(slotId ?? "")}
                  options={slotOptions}
                  ariaLabel={`Turno de ${displayName}`}
                  onChange={(next) =>
                    setValue(`${name}.${index}.slotId`, next, {
                      shouldDirty: true,
                      shouldTouch: true,
                    })
                  }
                />
                <DraftHint>
                  Dejalo en cualquier turno para un pase que sirve en todas las
                  franjas.
                </DraftHint>
              </div>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              aria-expanded={showAdvanced}
              aria-controls={advancedId}
              onClick={() => setShowAdvanced((open) => !open)}
              className="h-11 min-h-11 w-full justify-start gap-2 px-2 text-sm font-medium text-gray-500 hover:text-emerald-500"
            >
              <Settings2 className="size-4" aria-hidden />
              Opciones de preventa y límites
              {scheduled ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-600 uppercase dark:text-amber-300">
                  Programada
                </span>
              ) : null}
            </Button>

            <div
              id={advancedId}
              aria-hidden={!showAdvanced}
              className={cn(
                "grid transition-all duration-300 ease-in-out",
                showAdvanced
                  ? "grid-rows-[1fr] opacity-100"
                  : "pointer-events-none grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <DraftFieldLabel
                      htmlFor={`event-v2-${name}-${index}-sale-start`}
                      optional
                    >
                      ¿Desde cuándo se vende?
                    </DraftFieldLabel>
                    <Input
                      id={`event-v2-${name}-${index}-sale-start`}
                      type="datetime-local"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.startDate`)}
                    />
                    <DraftHint>Vacío = se vende apenas publiques.</DraftHint>
                  </div>
                  <div className="grid gap-1.5">
                    <DraftFieldLabel
                      htmlFor={`event-v2-${name}-${index}-sale-end`}
                      optional
                    >
                      ¿Hasta cuándo se vende?
                    </DraftFieldLabel>
                    <Input
                      id={`event-v2-${name}-${index}-sale-end`}
                      type="datetime-local"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.endDate`)}
                    />
                    <DraftHint>Vacío = hasta la fecha del evento.</DraftHint>
                  </div>
                  <div className="grid gap-1.5">
                    <DraftFieldLabel
                      htmlFor={`event-v2-${name}-${index}-min`}
                      optional
                    >
                      Mínimo por persona
                    </DraftFieldLabel>
                    <Input
                      id={`event-v2-${name}-${index}-min`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.minOrder`, {
                        setValueAs: (value) => draftNumberValue(value, 1),
                      })}
                    />
                    <DraftFieldError message={itemErrors?.minOrder?.message} />
                  </div>
                  <div className="grid gap-1.5">
                    <DraftFieldLabel
                      htmlFor={`event-v2-${name}-${index}-max`}
                      optional
                    >
                      Máximo por persona
                    </DraftFieldLabel>
                    <Input
                      id={`event-v2-${name}-${index}-max`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.maxOrder`, {
                        setValueAs: (value) => draftNumberValue(value, 10),
                      })}
                    />
                    <DraftFieldError message={itemErrors?.maxOrder?.message} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
