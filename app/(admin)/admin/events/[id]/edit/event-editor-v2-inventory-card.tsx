"use client"

import { Settings2 } from "lucide-react"
import { useLayoutEffect, useState } from "react"
import { useFormContext, useWatch, type UseFormRegister } from "react-hook-form"

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
import { OrganizerPublicPriceHint } from "./organizer-public-price-hint"
import { hasDraftPresale } from "@/lib/events/inventory-summary-v2"
import {
  draftScheduleDayChipLabel,
  hasMultipleDraftSlots,
  listDraftScheduleSlots,
} from "@/lib/events/draft-schedule-slots-v2"
import { ORGANIZER_BASE_PRICE_LABEL } from "@/lib/pricing/organizer-public-price-preview"
import { cn } from "@/lib/utils"
import {
  TICKET_COMMERCE_TYPES,
  TICKET_COMMERCE_TYPE_LABELS,
} from "@/lib/events/ticket-commerce-type"
import {
  ensureDraftDayRates,
  generalTicketNeedsDayPricing,
  sameDraftDayRateIds,
} from "@/lib/events/draft-day-priced-tickets"
import {
  draftNumberValue,
  toggleDraftLineupDay,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function DraftInventoryItemFields({
  name,
  index,
}: {
  name: "tickets" | "extras"
  index: number
}) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const schedule = useWatch({ control, name: "schedule" }) ?? []
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
  const scheduleDayKey = schedule
    .map((day) => day.id?.trim())
    .filter(Boolean)
    .join("|")
  const slotOptions = listDraftScheduleSlots(schedule)
  const showSlots = name === "tickets" && hasMultipleDraftSlots(schedule)
  const itemName = useWatch({ control, name: `${name}.${index}.name` })
  const price = useWatch({ control, name: `${name}.${index}.price` })
  const startDate = useWatch({ control, name: `${name}.${index}.startDate` })
  const endDate = useWatch({ control, name: `${name}.${index}.endDate` })
  const [showAdvanced, setShowAdvanced] = useState(() =>
    hasDraftPresale({
      startDate: getValues(`${name}.${index}.startDate`),
      endDate: getValues(`${name}.${index}.endDate`),
    }),
  )

  const itemErrors = errors[name]?.[index]
  const displayName = String(itemName ?? "").trim() || "Ítem"
  const scheduled = hasDraftPresale({ startDate, endDate })
  const dayRows = pricedByDay
    ? schedule.flatMap((day, dayIndex) => {
        const dayId = day.id?.trim()
        if (!dayId) return []
        return [
          {
            dayId,
            label: draftScheduleDayChipLabel(day, dayIndex),
          },
        ]
      })
    : []

  useLayoutEffect(() => {
    if (!pricedByDay || name !== "tickets") return
    const current = getValues(`${name}.${index}`)
    if (!current) return
    const synced = ensureDraftDayRates(current, getValues("schedule") ?? [])
    if (sameDraftDayRateIds(current.dayRates, synced.dayRates)) return
    setValue(`${name}.${index}.dayRates`, synced.dayRates, {
      shouldDirty: false,
      shouldTouch: false,
    })
    setValue(`${name}.${index}.price`, synced.price, { shouldDirty: false })
    setValue(`${name}.${index}.stock`, synced.stock, { shouldDirty: false })
  }, [getValues, index, name, pricedByDay, scheduleDayKey, setValue])

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

  function syncHeadlineFromDayRates() {
    const rates = getValues(`${name}.${index}.dayRates`) ?? []
    if (rates.length === 0) return
    setValue(`${name}.${index}.price`, draftNumberValue(rates[0]?.price), {
      shouldDirty: true,
    })
    setValue(
      `${name}.${index}.stock`,
      rates.reduce((sum, rate) => sum + draftNumberValue(rate.stock), 0),
      { shouldDirty: true },
    )
  }

  return (
    <div className="space-y-4">
      <input type="hidden" {...register(`${name}.${index}.id`)} />
      <input type="hidden" {...register(`${name}.${index}.source`)} />
      <input type="hidden" {...register(`${name}.${index}.sectorId`)} />
      <input type="hidden" {...register(`${name}.${index}.layoutType`)} />
      <input type="hidden" {...register(`${name}.${index}.slotId`)} />

      <div className="grid grid-cols-1 gap-3">
        <div className="grid gap-1.5">
          <DraftFieldLabel htmlFor={`event-v2-${name}-${index}-name`} required>
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
        {pricedByDay ? (
          <>
            <input
              type="hidden"
              {...register(`${name}.${index}.price`, {
                setValueAs: draftNumberValue,
              })}
            />
            <input
              type="hidden"
              {...register(`${name}.${index}.stock`, {
                setValueAs: draftNumberValue,
              })}
            />
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <DraftFieldLabel
                htmlFor={`event-v2-${name}-${index}-price`}
                required
              >
                {ORGANIZER_BASE_PRICE_LABEL}
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
              <OrganizerPublicPriceHint price={price} />
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
        )}
      </div>

      {pricedByDay ? (
        <DraftDayRateFields
          name={name}
          index={index}
          rows={dayRows}
          register={register}
          onRateChange={syncHeadlineFromDayRates}
        />
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
        aria-controls={`event-v2-${name}-${index}-panel-advanced`}
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

      {showAdvanced ? (
        <div
          id={`event-v2-${name}-${index}-panel-advanced`}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40 sm:grid-cols-2"
        >
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
            <DraftFieldLabel htmlFor={`event-v2-${name}-${index}-min`} optional>
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
            <DraftFieldLabel htmlFor={`event-v2-${name}-${index}-max`} optional>
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
      ) : null}
    </div>
  )
}

function DraftDayRatePriceField({
  name,
  index,
  rowIndex,
  dayId,
  register,
  onRateChange,
}: {
  name: "tickets" | "extras"
  index: number
  rowIndex: number
  dayId: string
  register: UseFormRegister<EventDraftV2>
  onRateChange: () => void
}) {
  const { control } = useFormContext<EventDraftV2>()
  const price = useWatch({
    control,
    name: `${name}.${index}.dayRates.${rowIndex}.price`,
  })

  return (
    <div className="grid gap-1.5">
      <DraftFieldLabel
        htmlFor={`event-v2-${name}-${index}-price-${dayId}`}
        required
      >
        {ORGANIZER_BASE_PRICE_LABEL}
      </DraftFieldLabel>
      <Input
        id={`event-v2-${name}-${index}-price-${dayId}`}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        className={DRAFT_FIELD_CLASS}
        data-field={`${name}.${index}.dayRates.${rowIndex}.price`}
        {...register(`${name}.${index}.dayRates.${rowIndex}.price`, {
          setValueAs: draftNumberValue,
          onChange: onRateChange,
        })}
      />
      <OrganizerPublicPriceHint price={price} />
    </div>
  )
}

function DraftDayRateFields({
  name,
  index,
  rows,
  register,
  onRateChange,
}: {
  name: "tickets" | "extras"
  index: number
  rows: Array<{ dayId: string; label: string }>
  register: UseFormRegister<EventDraftV2>
  onRateChange: () => void
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
      <DraftFieldLabel>Precio y stock por día</DraftFieldLabel>
      <DraftHint>
        El viernes y el sábado son entradas distintas. Cada jornada tiene su
        precio y su cupo.
      </DraftHint>
      <div className="grid gap-2">
        {rows.map((row, rowIndex) => (
          <div
            key={row.dayId}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-start"
          >
            <input
              type="hidden"
              {...register(`${name}.${index}.dayRates.${rowIndex}.dayId`)}
            />
            <input
              type="hidden"
              {...register(`${name}.${index}.dayRates.${rowIndex}.ticketId`)}
            />
            <p className="text-sm font-semibold text-slate-800 sm:pt-7 dark:text-zinc-100">
              {row.label}
            </p>
            <DraftDayRatePriceField
              name={name}
              index={index}
              rowIndex={rowIndex}
              dayId={row.dayId}
              register={register}
              onRateChange={onRateChange}
            />
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
                data-field={`${name}.${index}.dayRates.${rowIndex}.stock`}
                {...register(`${name}.${index}.dayRates.${rowIndex}.stock`, {
                  setValueAs: draftNumberValue,
                  onChange: onRateChange,
                })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
