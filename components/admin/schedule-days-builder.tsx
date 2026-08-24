"use client"

import { CalendarRange, Plus, Trash2 } from "lucide-react"
import { useFieldArray, type Control } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { EventStudioDateTimeField } from "@/components/admin/events/event-studio-datetime-field"
import { Input } from "@/components/ui/input"
import { STUDIO_CONTROL_CLASS } from "@/lib/admin/studio-form-styles"
import type { EventFormValues } from "@/lib/validations/event-form"
import { newScheduleDayId } from "@/lib/event-schedule"
import { cn } from "@/lib/utils"

const ROW_CLASS =
  "grid grid-cols-1 items-end gap-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]"

export function ScheduleDaysBuilder({
  control,
}: {
  control: Control<EventFormValues>
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "basics.scheduleDays",
    keyName: "_rowId",
  })

  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarRange
            className="size-4 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
          Jornadas del festival
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Cada noche o día opera como una ventana de acceso independiente.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div
          className={cn(
            ROW_CLASS,
            "hidden border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] font-medium text-muted-foreground md:grid dark:border-zinc-800 dark:bg-zinc-950/70",
          )}
        >
          <span>Nombre</span>
          <span>Inicio</span>
          <span>Cierre</span>
          <span className="sr-only">Quitar</span>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {fields.map((field, index) => (
            <div key={field._rowId} className={cn(ROW_CLASS, "px-2 py-2")}>
              <FormField
                control={control}
                name={`basics.scheduleDays.${index}.title`}
                render={({ field: titleField, fieldState }) => (
                  <FormItem className="gap-y-1">
                    <FormLabel
                      htmlFor={`schedule-day-${index}-title`}
                      className="text-[11px] md:sr-only"
                      required
                    >
                      Nombre de la jornada
                    </FormLabel>
                    <Input
                      {...titleField}
                      id={`schedule-day-${index}-title`}
                      placeholder={
                        index === 0
                          ? "Día 1 - Noche de apertura"
                          : `Día ${index + 1}`
                      }
                      className={cn(STUDIO_CONTROL_CLASS, "h-9")}
                    />
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={`basics.scheduleDays.${index}.startTime`}
                render={({ field: startField, fieldState }) => (
                  <FormItem className="gap-y-1">
                    <FormLabel
                      htmlFor={`schedule-day-${index}-start`}
                      className="text-[11px] md:sr-only"
                      required
                    >
                      Inicio
                    </FormLabel>
                    <EventStudioDateTimeField
                      id={`schedule-day-${index}-start`}
                      fieldName={`basics.scheduleDays.${index}.startTime`}
                      value={startField.value}
                      onChange={startField.onChange}
                      compact
                    />
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`basics.scheduleDays.${index}.endTime`}
                render={({ field: endField, fieldState }) => (
                  <FormItem className="gap-y-1">
                    <FormLabel
                      htmlFor={`schedule-day-${index}-end`}
                      className="text-[11px] md:sr-only"
                      required
                    >
                      Cierre
                    </FormLabel>
                    <EventStudioDateTimeField
                      id={`schedule-day-${index}-end`}
                      fieldName={`basics.scheduleDays.${index}.endTime`}
                      value={endField.value}
                      onChange={endField.onChange}
                      compact
                    />
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={fields.length <= 2}
                onClick={() => remove(index)}
                className="mb-0.5 size-9 shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                aria-label={`Eliminar jornada ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Button
        type="button"
        onClick={() =>
          append({
            id: newScheduleDayId(),
            title: `Día ${fields.length + 1}`,
            startTime: "",
            endTime: "",
          })
        }
        className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Agregar otra jornada / fecha
      </Button>

      <FormField
        control={control}
        name="basics.scheduleDays"
        render={({ fieldState }) => (
          <FormMessage>{fieldState.error?.message}</FormMessage>
        )}
      />
    </section>
  )
}
