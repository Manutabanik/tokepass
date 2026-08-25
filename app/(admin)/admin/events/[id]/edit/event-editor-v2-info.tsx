"use client"

import { CalendarDays, ImagePlus, MapPin, Type } from "lucide-react"
import { useFormContext } from "react-hook-form"

import { EventEditorV2MediaField } from "./event-editor-v2-media"
import {
  DRAFT_FIELD_CLASS,
  DraftCard,
  DraftFieldError,
} from "./event-editor-v2-ui"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2InfoStep({ eventId }: { eventId: string }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()

  return (
    <div className="space-y-5">
      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <Type className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Identidad del evento
          </h2>
        </div>
        <div className="grid gap-2">
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
          <DraftFieldError message={errors.basicInfo?.name?.message} />
        </div>
      </DraftCard>

      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Fechas
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label
              htmlFor="event-v2-start-date"
              className="text-sm font-bold text-slate-800 dark:text-zinc-200"
            >
              Fecha de inicio
            </Label>
            <Input
              id="event-v2-start-date"
              type="datetime-local"
              className={DRAFT_FIELD_CLASS}
              {...register("basicInfo.startDate")}
            />
            <DraftFieldError message={errors.basicInfo?.startDate?.message} />
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="event-v2-end-date"
              className="text-sm font-bold text-slate-800 dark:text-zinc-200"
            >
              Fecha de fin
            </Label>
            <Input
              id="event-v2-end-date"
              type="datetime-local"
              className={DRAFT_FIELD_CLASS}
              {...register("basicInfo.endDate")}
            />
            <DraftFieldError message={errors.basicInfo?.endDate?.message} />
          </div>
        </div>
      </DraftCard>

      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Lugar
          </h2>
        </div>
        <div className="grid gap-2">
          <Label
            htmlFor="event-v2-location"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Nombre del lugar
          </Label>
          <Input
            id="event-v2-location"
            className={DRAFT_FIELD_CLASS}
            placeholder="Ej. Club Atlético, Salón Norte"
            {...register("basicInfo.locationName")}
          />
          <DraftFieldError message={errors.basicInfo?.locationName?.message} />
        </div>
      </DraftCard>

      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <ImagePlus className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Imágenes
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
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
