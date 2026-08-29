"use client"

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
  DRAFT_FIELD_CLASS,
  DraftFieldError,
  DraftFieldLabel,
  DraftHint,
  SplitRowSection,
} from "./event-editor-v2-ui"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  emptyEventDraftV2Location,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function EventEditorV2InfoStep({
  eventId,
}: {
  eventId: string
  revealField?: string | null
}) {
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
    <div>
      <SplitRowSection
        title="Identidad del evento"
        description="Tipo, nombre e imágenes principales. Así aparece en el catálogo y en las entradas."
      >
        <EventEditorV2ArchetypePicker embedded />

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
      </SplitRowSection>

      <SplitRowSection
        title="Artistas y Lineup"
        description={`Opcional. Buscá en Spotify o en el catálogo, o cargá a ${labels.participants.toLowerCase()} a mano.`}
      >
        <EventEditorV2LineupFields embedded />
      </SplitRowSection>

      <SplitRowSection
        title="Fechas y Ubicación"
        description="Definí si es online, las fechas y el lugar. El mapa queda afuera si el evento es virtual."
      >
        {supportsVirtual ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
            <div className="min-w-0">
              <Label
                htmlFor="event-v2-is-virtual"
                className="text-sm font-medium text-foreground"
              >
                Es online
              </Label>
              <p className="text-xs text-muted-foreground">
                El acceso va por link. Provincia, ciudad y mapa quedan fuera.
              </p>
            </div>
            <Switch
              id="event-v2-is-virtual"
              checked={isVirtual}
              onCheckedChange={setVirtual}
              className="data-checked:bg-emerald-500"
              aria-label="Evento virtual / online"
            />
          </div>
        ) : null}

        <EventEditorV2LocationFields
          embedded
          hideFields={supportsVirtual && isVirtual}
        />

        <div hidden={!supportsVirtual || !isVirtual}>
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
        </div>

        <EventEditorV2ScheduleFields embedded />
      </SplitRowSection>

      <SplitRowSection
        title="Multimedia y Reglas"
        description="Video, galería y las reglas que el comprador ve antes de pagar."
        className="mb-0 border-b-0 pb-0"
      >
        <EventEditorV2MultimediaCard eventId={eventId} embedded />
        <EventEditorV2UsefulInfoCard embedded />
      </SplitRowSection>
    </div>
  )
}
