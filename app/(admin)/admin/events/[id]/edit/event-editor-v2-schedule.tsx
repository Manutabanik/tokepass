"use client"

import { CalendarDays, Copy, Plus, Trash2 } from "lucide-react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import { useDraftArchetype } from "./event-editor-v2-archetype"
import {
  DRAFT_FIELD_CLASS,
  DRAFT_TICKET_CARD_CLASS,
  DraftAddButton,
  DraftCard,
  DraftFieldError,
  DraftFieldLabel,
  DraftHint,
} from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { archetypeUsesTimeSlots } from "@/lib/events/archetypes.config"
import { pruneDraftScheduleBindings } from "@/lib/events/draft-schedule-bindings"
import {
  createDraftScheduleDay,
  createDraftScheduleSlot,
  duplicateDraftSlotsToOtherDays,
  syncDraftScheduleBounds,
} from "@/lib/events/draft-schedule-slots-v2"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2ScheduleFields({
  embedded = false,
}: {
  embedded?: boolean
}) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const { archetype } = useDraftArchetype()
  const usesSlots = archetypeUsesTimeSlots(archetype)
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "schedule",
    keyName: "_rowId",
    shouldUnregister: false,
  })
  const schedule = useWatch({ control, name: "schedule" }) ?? []

  function addDay() {
    append(
      createDraftScheduleDay({
        name: `Día ${fields.length + 1}`,
      }),
    )
  }

  function syncDay(index: number) {
    const current = getValues(`schedule.${index}`)
    const next = syncDraftScheduleBounds({
      ...createDraftScheduleDay(current),
      ...current,
      slots: current?.slots ?? [],
    })
    setValue(`schedule.${index}.date`, next.date, { shouldDirty: true })
    setValue(`schedule.${index}.startDate`, next.startDate, { shouldDirty: true })
    setValue(`schedule.${index}.endDate`, next.endDate, { shouldDirty: true })
  }

  function duplicateSlots(fromIndex: number) {
    const next = duplicateDraftSlotsToOtherDays(getValues("schedule") ?? [], fromIndex)
    replace(next)
  }

  const body = (
    <>
      {embedded ? (
        <p className="text-sm font-medium text-foreground">
          {usesSlots ? "Fechas y turnos" : "Fechas y funciones"}
        </p>
      ) : (
        <>
      <div className="mb-5 flex items-center gap-2">
        <CalendarDays className="size-4 text-emerald-400" aria-hidden />
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          {usesSlots ? "Fechas y turnos" : "Fechas y funciones"}
        </h2>
      </div>
      <DraftHint>
        {usesSlots
          ? "Cada fecha puede tener varias franjas horarias. Duplicá los turnos para armar la semana de una vez."
          : "Por defecto el evento dura un día. Agregá otra función si se repite en varias fechas."}
      </DraftHint>
        </>
      )}

      <ul className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map((field, index) => {
          const dayErrors = errors.schedule?.[index]
          const label = schedule[index]?.name?.trim() || `Día ${index + 1}`
          return (
            <li key={field._rowId} className={DRAFT_TICKET_CARD_CLASS}>
              <input type="hidden" {...register(`schedule.${index}.id`)} />
              {fields.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 size-11 text-muted-foreground hover:text-red-500"
                  aria-label={`Eliminar ${label}`}
                  onClick={() => {
                    remove(index)
                    const next = pruneDraftScheduleBindings(getValues())
                    setValue("seatingMaps", next.seatingMaps ?? [], {
                      shouldDirty: true,
                    })
                    setValue("tickets", next.tickets ?? [], { shouldDirty: true })
                    setValue("extras", next.extras ?? [], { shouldDirty: true })
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}

              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1.5">
                  <DraftFieldLabel
                    htmlFor={`event-v2-schedule-${index}-name`}
                    optional
                  >
                    Cómo se llama este día
                  </DraftFieldLabel>
                  <Input
                    id={`event-v2-schedule-${index}-name`}
                    className={DRAFT_FIELD_CLASS}
                    placeholder={
                      usesSlots ? "Ej. Sábado de Cabalgata" : `Día ${index + 1}`
                    }
                    {...register(`schedule.${index}.name`)}
                  />
                  <DraftHint>Opcional. Ej. Día 1, Función noche.</DraftHint>
                </div>

                {usesSlots ? (
                  <>
                    <input type="hidden" {...register(`schedule.${index}.startDate`)} />
                    <input type="hidden" {...register(`schedule.${index}.endDate`)} />
                    <div className="grid gap-1.5">
                      <DraftFieldLabel
                        htmlFor={`event-v2-schedule-${index}-date`}
                        required
                      >
                        ¿Qué día?
                      </DraftFieldLabel>
                      <Input
                        id={`event-v2-schedule-${index}-date`}
                        type="date"
                        className={DRAFT_FIELD_CLASS}
                        {...register(`schedule.${index}.date`, {
                          onChange: () => syncDay(index),
                        })}
                      />
                      <DraftFieldError message={dayErrors?.startDate?.message} />
                    </div>
                    <DaySlotList dayIndex={index} onChange={() => syncDay(index)} />
                    {fields.length > 1 && (schedule[index]?.slots?.length ?? 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => duplicateSlots(index)}
                        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-emerald-600 transition hover:text-emerald-500 dark:text-emerald-400"
                      >
                        <Copy className="size-3.5" aria-hidden />
                        Duplicar turnos a otros días
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <DraftFieldLabel
                        htmlFor={`event-v2-schedule-${index}-start`}
                        required
                      >
                        ¿Cuándo empieza?
                      </DraftFieldLabel>
                      <Input
                        id={`event-v2-schedule-${index}-start`}
                        type="datetime-local"
                        className={DRAFT_FIELD_CLASS}
                        {...register(`schedule.${index}.startDate`)}
                      />
                      <DraftFieldError message={dayErrors?.startDate?.message} />
                    </div>
                    <div className="grid gap-1.5">
                      <DraftFieldLabel
                        htmlFor={`event-v2-schedule-${index}-end`}
                        optional={fields.length === 1}
                        required={fields.length > 1}
                      >
                        ¿Cuándo termina?
                      </DraftFieldLabel>
                      <Input
                        id={`event-v2-schedule-${index}-end`}
                        type="datetime-local"
                        className={DRAFT_FIELD_CLASS}
                        {...register(`schedule.${index}.endDate`)}
                      />
                      <DraftFieldError message={dayErrors?.endDate?.message} />
                    </div>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className={embedded ? "mt-2" : "mt-4"}>
        <DraftAddButton onClick={addDay}>
          <Plus className="size-4" aria-hidden />
          Agregar otro día / función
        </DraftAddButton>
      </div>
    </>
  )

  if (embedded) return <div className="space-y-3">{body}</div>
  return <DraftCard className="md:col-span-12">{body}</DraftCard>
}

function DaySlotList({
  dayIndex,
  onChange,
}: {
  dayIndex: number
  onChange: () => void
}) {
  const { control, register } = useFormContext<EventDraftV2>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `schedule.${dayIndex}.slots`,
    keyName: "_rowId",
    shouldUnregister: false,
  })

  function addSlot() {
    append(
      createDraftScheduleSlot({
        startTime: "10:00",
        endTime: "12:00",
      }),
    )
    window.setTimeout(onChange, 0)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
        Franjas horarias
      </p>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin turnos todavía. Agregá una franja para ese día.
        </p>
      ) : (
        <ul className="space-y-2">
          {fields.map((field, slotIndex) => (
            <li
              key={field._rowId}
              className="grid grid-cols-1 items-end gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/40 md:grid-cols-[1fr_1fr_7rem_auto]"
            >
              <input
                type="hidden"
                {...register(`schedule.${dayIndex}.slots.${slotIndex}.id`)}
              />
              <div className="grid gap-1">
                <DraftFieldLabel
                  htmlFor={`event-v2-slot-${dayIndex}-${slotIndex}-start`}
                  required
                >
                  ¿Desde?
                </DraftFieldLabel>
                <Input
                  id={`event-v2-slot-${dayIndex}-${slotIndex}-start`}
                  type="time"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`schedule.${dayIndex}.slots.${slotIndex}.startTime`, {
                    onChange,
                  })}
                />
              </div>
              <div className="grid gap-1">
                <DraftFieldLabel
                  htmlFor={`event-v2-slot-${dayIndex}-${slotIndex}-end`}
                  required
                >
                  ¿Hasta?
                </DraftFieldLabel>
                <Input
                  id={`event-v2-slot-${dayIndex}-${slotIndex}-end`}
                  type="time"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`schedule.${dayIndex}.slots.${slotIndex}.endTime`, {
                    onChange,
                  })}
                />
              </div>
              <div className="grid gap-1">
                <DraftFieldLabel
                  htmlFor={`event-v2-slot-${dayIndex}-${slotIndex}-cap`}
                  optional
                >
                  Cupo
                </DraftFieldLabel>
                <Input
                  id={`event-v2-slot-${dayIndex}-${slotIndex}-cap`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="—"
                  className={DRAFT_FIELD_CLASS}
                  {...register(`schedule.${dayIndex}.slots.${slotIndex}.capacity`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground hover:text-red-500"
                aria-label={`Eliminar turno ${slotIndex + 1}`}
                onClick={() => {
                  remove(slotIndex)
                  window.setTimeout(onChange, 0)
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={addSlot}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-emerald-600 transition hover:text-emerald-500 dark:text-emerald-400"
      >
        <Plus className="size-3.5" aria-hidden />
        Agregar turno / franja horaria
      </button>
    </div>
  )
}
