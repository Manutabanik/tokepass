"use client"

import { ImagePlus, MonitorPlay, Type } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { EventEditorV2ArchetypePicker, useDraftArchetype } from "./event-editor-v2-archetype"
import { EventEditorV2LocationFields } from "./event-editor-v2-location"
import { EventEditorV2MediaField } from "./event-editor-v2-media"
import { EventEditorV2LineupFields } from "./event-editor-v2-lineup"
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
import {
  emptyEventDraftV2Location,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function EventEditorV2InfoStep({ eventId }: { eventId: string }) {
  const {
    register,
    setValue,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const { labels, supportsVirtual } = useDraftArchetype()
  const isVirtual = Boolean(useWatch({ name: "isVirtual" }))

  function setVirtual(checked: boolean) {
    setValue("isVirtual", checked, { shouldDirty: true, shouldTouch: true })
    setValue("settings.deliveryMode", checked ? "ONLINE" : "PRESENCIAL", {
      shouldDirty: true,
    })
    if (checked) {
      setValue("location", emptyEventDraftV2Location(), {
        shouldDirty: true,
        shouldTouch: true,
      })
      setValue("basicInfo.locationName", "", { shouldDirty: true })
    }
  }

  return (
    <div className="space-y-6">
      <EventEditorV2ArchetypePicker />

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
            <DraftHint>
              Así lo van a ver en el catálogo y en {labels.tickets.toLowerCase()}.
            </DraftHint>
            <DraftFieldError message={errors.basicInfo?.name?.message} />
          </div>
        </div>
      </DraftCard>

      <EventEditorV2ScheduleFields />

      <EventEditorV2LineupFields />

      {supportsVirtual ? (
        <DraftCard className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MonitorPlay className="size-4 text-emerald-400" aria-hidden />
              <Label
                htmlFor="event-v2-is-virtual"
                className="text-sm font-bold text-slate-800 dark:text-zinc-200"
              >
                ¿Es un evento virtual / online?
              </Label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isVirtual
                ? "Se oculta el mapa y no se guardan coordenadas. El acceso va por link."
                : "Si es presencial, el lugar y la dirección son obligatorios para publicar."}
            </p>
          </div>
          <Switch
            id="event-v2-is-virtual"
            checked={isVirtual}
            onCheckedChange={setVirtual}
            className="data-checked:bg-emerald-500"
            aria-label="Evento virtual / online"
          />
        </DraftCard>
      ) : null}

      {supportsVirtual && isVirtual ? (
        <DraftCard>
          <div className="grid gap-2">
            <Label
              htmlFor="event-v2-virtual-link"
              className="text-sm font-bold text-slate-800 dark:text-zinc-200"
            >
              Link de acceso
            </Label>
            <Input
              id="event-v2-virtual-link"
              className={DRAFT_FIELD_CLASS}
              placeholder="Link de Zoom, Meet, YouTube..."
              {...register("virtualLink")}
            />
            <DraftHint>
              El mapa de Leaflet queda fuera del borrador mientras el evento sea
              virtual.
            </DraftHint>
            <DraftFieldError message={errors.virtualLink?.message} />
          </div>
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
