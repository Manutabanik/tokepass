"use client"

import { ImagePlus, Type } from "lucide-react"
import { useLayoutEffect, useState } from "react"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  infoLocationErrorsOpenLogistics,
  infoSuperPanelForFieldPath,
  resolveInfoSuperPanel,
  type InfoSuperPanelId,
} from "@/lib/events/editor-v2-info-panels"
import {
  emptyEventDraftV2Location,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

const SUPER_PANEL_ITEM_CLASS =
  "not-last:border-b-0 mb-4 overflow-hidden rounded-2xl border border-border/50 bg-card px-3 shadow-sm last:mb-0"

export function EventEditorV2InfoStep({
  eventId,
  revealField = null,
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
  const eventName = useWatch({ name: "basicInfo.name" })
  const isVirtual = Boolean(useWatch({ name: "isVirtual" }))
  const [openPanel, setOpenPanel] = useState<InfoSuperPanelId[]>(() => [
    resolveInfoSuperPanel(errors, revealField),
  ])
  const locationErrors = infoLocationErrorsOpenLogistics(errors)

  useLayoutEffect(() => {
    if (revealField?.trim()) {
      setOpenPanel([infoSuperPanelForFieldPath(revealField)])
      return
    }
    if (locationErrors) {
      setOpenPanel(["logistics"])
    }
  }, [locationErrors, revealField])

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

  const onlineSwitch = supportsVirtual ? (
    <div className="inline-flex items-center gap-2">
      <Switch
        id="event-v2-is-virtual"
        checked={isVirtual}
        onCheckedChange={setVirtual}
        className="data-checked:bg-emerald-500"
        aria-label="Evento virtual / online"
      />
      <Label
        htmlFor="event-v2-is-virtual"
        className="text-xs font-semibold text-slate-700 dark:text-zinc-200"
      >
        Es online
      </Label>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      <Accordion
        type="single"
        collapsible
        keepMounted
        value={openPanel}
        onValueChange={(next) => {
          const panel = next[0]
          setOpenPanel(panel === "identity" || panel === "logistics" ? [panel] : [])
        }}
        className="w-full"
      >
        <AccordionItem value="identity" className={SUPER_PANEL_ITEM_CLASS}>
          <AccordionTrigger className="px-1 py-4 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-3 text-left">
              <Type className="size-4 shrink-0 text-emerald-400" aria-hidden />
              <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                Identidad • {eventName?.trim() || "Nuevo Evento"}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <EventEditorV2ArchetypePicker />

            <DraftCard>
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

            <DraftCard>
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

            <EventEditorV2LineupFields />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="logistics" className={SUPER_PANEL_ITEM_CLASS}>
          <AccordionTrigger className="px-1 py-4 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-3 text-left">
              <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                Tiempo y espacio • Logística
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <EventEditorV2ScheduleFields />

            <EventEditorV2LocationFields
              headerExtra={onlineSwitch}
              hideFields={supportsVirtual && isVirtual}
            />

            <div hidden={!supportsVirtual || !isVirtual}>
              <DraftCard>
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
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className={BENTO_GRID_CLASS}>
        <EventEditorV2MultimediaCard eventId={eventId} />
        <EventEditorV2UsefulInfoCard />
      </div>
    </div>
  )
}
