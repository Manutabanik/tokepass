"use client"

import { ImagePlus, MonitorPlay, Type } from "lucide-react"
import { Controller, useFormContext, useWatch } from "react-hook-form"

import { EventEditorV2LocationFields } from "./event-editor-v2-location"
import { EventEditorV2MediaField } from "./event-editor-v2-media"
import { EventEditorV2ScheduleFields } from "./event-editor-v2-schedule"
import {
  DRAFT_FIELD_CLASS,
  DraftCard,
  DraftFieldError,
  DraftHint,
} from "./event-editor-v2-ui"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2InfoStep({ eventId }: { eventId: string }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const deliveryMode = useWatch({ control, name: "settings.deliveryMode" })
  const isOnline = deliveryMode === "ONLINE"

  return (
    <div className="space-y-6">
      <DraftCard>
        <div className="mb-5 flex items-center gap-2">
          <Type className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Datos del evento
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label
              htmlFor="event-v2-name"
              className="text-sm font-bold text-slate-800 dark:text-zinc-200"
            >
              Nombre del evento
            </Label>
            <Input
              id="event-v2-name"
              className={DRAFT_FIELD_CLASS}
              placeholder="Ej. After en la terraza"
              {...register("basicInfo.name")}
            />
            <DraftHint>Así lo van a ver en el catálogo y en las entradas.</DraftHint>
            <DraftFieldError message={errors.basicInfo?.name?.message} />
          </div>
        </div>
      </DraftCard>

      <EventEditorV2ScheduleFields />

      <DraftCard className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MonitorPlay className="size-4 text-emerald-400" aria-hidden />
            <Label
              htmlFor="event-v2-online"
              className="text-sm font-bold text-slate-800 dark:text-zinc-200"
            >
              Evento online
            </Label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isOnline
              ? "No hace falta una dirección física para publicar."
              : "Si es presencial, el lugar y la dirección son obligatorios para publicar."}
          </p>
        </div>
        <Controller
          name="settings.deliveryMode"
          control={control}
          render={({ field }) => (
            <Switch
              id="event-v2-online"
              checked={field.value === "ONLINE"}
              onCheckedChange={(checked) =>
                field.onChange(checked ? "ONLINE" : "PRESENCIAL")
              }
              className="data-checked:bg-emerald-500"
              aria-label="Evento online"
            />
          )}
        />
      </DraftCard>

      {isOnline ? (
        <DraftCard>
          <p className="text-sm text-muted-foreground">
            Este evento es online. El mapa y la dirección quedan fuera del
            borrador hasta que lo pases a presencial.
          </p>
        </DraftCard>
      ) : (
        <EventEditorV2LocationFields />
      )}

      <DraftCard>
        <div className="mb-5 flex items-center gap-2">
          <ImagePlus className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Imágenes
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <EventEditorV2MediaField
            eventId={eventId}
            name="flyerUrl"
            label="Flyer"
            hint="Portada del evento. Se guarda como URL en el JSON."
          />
          <EventEditorV2MediaField
            eventId={eventId}
            name="bannerUrl"
            label="Banner"
            hint="Imagen ancha opcional para la ficha."
          />
        </div>
      </DraftCard>
    </div>
  )
}
