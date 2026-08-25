"use client"

import { CalendarDays, Plus, Trash2 } from "lucide-react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import {
  DRAFT_FIELD_CLASS,
  DRAFT_TICKET_CARD_CLASS,
  DraftAddButton,
  DraftCard,
  DraftFieldError,
  DraftHint,
} from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createDraftScheduleDay,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function EventEditorV2ScheduleFields() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "schedule",
    keyName: "_rowId",
  })
  const schedule = useWatch({ control, name: "schedule" }) ?? []

  function addDay() {
    append(
      createDraftScheduleDay({
        name: `Día ${fields.length + 1}`,
      }),
    )
  }

  return (
    <DraftCard>
      <div className="mb-5 flex items-center gap-2">
        <CalendarDays className="size-4 text-emerald-400" aria-hidden />
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          Fechas y funciones
        </h2>
      </div>
      <DraftHint>
        Por defecto el evento dura un día. Agregá otra función si se repite en
        varias fechas.
      </DraftHint>

      <ul className="mt-5 space-y-3">
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
                  className="absolute top-3 right-3 text-muted-foreground hover:text-red-500"
                  aria-label={`Eliminar ${label}`}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}

              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={`event-v2-schedule-${index}-name`}
                    className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                  >
                    Nombre del día / función
                  </Label>
                  <Input
                    id={`event-v2-schedule-${index}-name`}
                    className={DRAFT_FIELD_CLASS}
                    placeholder={`Día ${index + 1}`}
                    {...register(`schedule.${index}.name`)}
                  />
                  <DraftHint>Opcional. Ej. Día 1, Función noche.</DraftHint>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-schedule-${index}-start`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Inicio
                    </Label>
                    <Input
                      id={`event-v2-schedule-${index}-start`}
                      type="datetime-local"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`schedule.${index}.startDate`)}
                    />
                    <DraftFieldError message={dayErrors?.startDate?.message} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-schedule-${index}-end`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Fin
                    </Label>
                    <Input
                      id={`event-v2-schedule-${index}-end`}
                      type="datetime-local"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`schedule.${index}.endDate`)}
                    />
                    <DraftFieldError message={dayErrors?.endDate?.message} />
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4">
        <DraftAddButton onClick={addDay}>
          <Plus className="size-4" aria-hidden />
          Agregar otro día / función
        </DraftAddButton>
      </div>
    </DraftCard>
  )
}
