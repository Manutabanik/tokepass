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
import { Input } from "@/components/ui/input"
import type { EventFormValues } from "@/lib/validations/event-form"

function newScheduleDayId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ScheduleDaysBuilder({
  control,
}: {
  control: Control<EventFormValues>
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "basics.scheduleDays",
  })

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-white">
            <CalendarRange className="size-4 text-emerald-400" aria-hidden="true" />
            Jornadas del festival
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Cada noche o día opera como una ventana de acceso independiente.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <article
            key={field.id}
            className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Jornada {index + 1}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={fields.length <= 2}
                onClick={() => remove(index)}
                className="text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                aria-label={`Eliminar jornada ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="grid gap-3">
              <FormField
                control={control}
                name={`basics.scheduleDays.${index}.title`}
                render={({ field: titleField, fieldState }) => (
                  <FormItem>
                    <FormLabel
                      htmlFor={`schedule-day-${index}-title`}
                      className="font-mono text-[10px] uppercase tracking-wider text-zinc-500"
                    >
                      Nombre de la jornada
                    </FormLabel>
                    <Input
                      {...titleField}
                      id={`schedule-day-${index}-title`}
                      placeholder={
                        index === 0
                          ? "Día 1 - Noche de apertura"
                          : "Día 2 - Cierre"
                      }
                      className="h-10 border-zinc-800 bg-zinc-950"
                    />
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={control}
                  name={`basics.scheduleDays.${index}.startTime`}
                  render={({ field: startField, fieldState }) => (
                    <FormItem>
                      <FormLabel
                        htmlFor={`schedule-day-${index}-start`}
                        className="font-mono text-[10px] uppercase tracking-wider text-zinc-500"
                      >
                        Inicio
                      </FormLabel>
                      <Input
                        {...startField}
                        id={`schedule-day-${index}-start`}
                        type="datetime-local"
                        className="scheme-dark h-10 border-zinc-800 bg-zinc-950"
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`basics.scheduleDays.${index}.endTime`}
                  render={({ field: endField, fieldState }) => (
                    <FormItem>
                      <FormLabel
                        htmlFor={`schedule-day-${index}-end`}
                        className="font-mono text-[10px] uppercase tracking-wider text-zinc-500"
                      >
                        Cierre
                      </FormLabel>
                      <Input
                        {...endField}
                        id={`schedule-day-${index}-end`}
                        type="datetime-local"
                        className="scheme-dark h-10 border-zinc-800 bg-zinc-950"
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </article>
        ))}
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
        className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
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
