"use client"

import { ImagePlus, MonitorPlay, Type } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { EventEditorV2ArchetypePicker, useDraftArchetype } from "./event-editor-v2-archetype"
import { EventEditorV2LocationFields } from "./event-editor-v2-location"
import { EventEditorV2MediaField } from "./event-editor-v2-media"
import {
  EventEditorV2MultimediaCard,
  EventEditorV2UsefulInfoCard,
} from "./event-editor-v2-experience"
import { EventEditorV2LineupFields } from "./event-editor-v2-lineup"
import { EventEditorV2ScheduleFields } from "./event-editor-v2-schedule"
import {
  BENTO_GRID_CLASS,
  DRAFT_FIELD_CLASS,
  DraftCard,
  DraftFieldError,
  DraftFieldLabel,
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
    <div className={BENTO_GRID_CLASS}>
      <div className="h-full md:col-span-6">
        <EventEditorV2ArchetypePicker />
      </div>
        {supportsVirtual ? (
          <DraftCard className="h-full flex-col items-start justify-between gap-4 md:col-span-6 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-grow">
              <div className="flex items-center gap-2">
                <MonitorPlay className="size-4 text-emerald-400" aria-hidden />
                <Label
                  htmlFor="event-v2-is-virtual"
                  className="text-sm font-bold text-slate-800 dark:text-zinc-200"
                >
                  ¿Es online?
                </Label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isVirtual
                  ? "Se oculta el mapa. El acceso va por link."
                  : "Si es presencial, el lugar y la dirección son obligatorios."}
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
        ) : (
          <DraftCard className="h-full items-center md:col-span-6">
            <p className="text-sm text-muted-foreground">
              Este tipo de evento es presencial. El lugar se completa al lado de
              las fechas.
            </p>
          </DraftCard>
        )}

      <DraftCard className="md:col-span-12">
        <div className="mb-5 flex items-center gap-2">
          <Type className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Lo esencial
          </h2>
        </div>
        <div className="grid gap-2">
          <DraftFieldLabel htmlFor="event-v2-name" required className="text-sm">
            ¿Cómo se llama?
          </DraftFieldLabel>
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
      </DraftCard>

      <EventEditorV2ScheduleFields />

      <EventEditorV2LineupFields />

      {supportsVirtual && isVirtual ? (
        <DraftCard className="md:col-span-12">
          <div className="grid gap-2">
            <DraftFieldLabel
              htmlFor="event-v2-virtual-link"
              optional
              className="text-sm"
            >
              Link para entrar
            </DraftFieldLabel>
            <Input
              id="event-v2-virtual-link"
              className={DRAFT_FIELD_CLASS}
              placeholder="Link de Zoom, Meet, YouTube..."
              {...register("virtualLink")}
            />
            <DraftHint>
              El mapa queda fuera del borrador mientras el evento sea virtual.
            </DraftHint>
            <DraftFieldError message={errors.virtualLink?.message} />
          </div>
        </DraftCard>
      ) : (
        <EventEditorV2LocationFields />
      )}

      <DraftCard className="md:col-span-12">
        <div className="mb-5 flex items-center gap-2">
          <ImagePlus className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Imágenes
          </h2>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          <EventEditorV2MediaField
            eventId={eventId}
            name="flyerUrl"
            label="Portada"
            hint="La imagen principal del evento."
            optional
          />
          <EventEditorV2MediaField
            eventId={eventId}
            name="bannerUrl"
            label="Imagen ancha"
            hint="Para la ficha y las redes."
            optional
          />
        </div>
      </DraftCard>

      <EventEditorV2MultimediaCard eventId={eventId} />
      <EventEditorV2UsefulInfoCard />
    </div>
  )
}
