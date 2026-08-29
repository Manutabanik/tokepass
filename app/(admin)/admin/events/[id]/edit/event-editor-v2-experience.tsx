"use client"

import { Clapperboard, Info } from "lucide-react"
import { useFormContext } from "react-hook-form"

import { EventEditorV2GalleryField } from "./event-editor-v2-gallery"
import {
  DRAFT_FIELD_CLASS,
  DRAFT_TEXTAREA_CLASS,
  DraftCard,
  DraftFieldError,
  DraftFieldLabel,
  DraftHint,
} from "./event-editor-v2-ui"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2MultimediaCard({
  eventId,
  embedded = false,
}: {
  eventId: string
  embedded?: boolean
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()

  const body = (
      <div className="grid flex-grow gap-4">
        <div className="grid gap-2">
          <DraftFieldLabel htmlFor="event-v2-promo-video" optional className="text-sm">
            Video promo
          </DraftFieldLabel>
          <Input
            id="event-v2-promo-video"
            className={DRAFT_FIELD_CLASS}
            placeholder="Link de YouTube o Vimeo"
            {...register("promoVideoUrl")}
          />
          <DraftHint>Se muestra en la ficha, debajo de la portada.</DraftHint>
          <DraftFieldError message={errors.promoVideoUrl?.message} />
        </div>
        <EventEditorV2GalleryField eventId={eventId} />
      </div>
  )

  if (embedded) return body

  return (
    <DraftCard className="md:col-span-12">
      <div className="mb-5 flex items-center gap-2">
        <Clapperboard className="size-4 text-emerald-400" aria-hidden />
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          Multimedia
        </h2>
      </div>
      {body}
    </DraftCard>
  )
}

export function EventEditorV2UsefulInfoCard({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()

  const body = (
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <DraftFieldLabel htmlFor="event-v2-restrictions" optional className="text-sm">
            Restricciones y edad
          </DraftFieldLabel>
          <Textarea
            id="event-v2-restrictions"
            rows={5}
            className={DRAFT_TEXTAREA_CLASS}
            placeholder="Ej. +18. DNI en puerta. No se permite ingreso con alcohol."
            {...register("restrictions")}
          />
          <DraftHint>El comprador lo ve en la ficha, antes de pagar.</DraftHint>
          <DraftFieldError message={errors.restrictions?.message} />
        </div>
        <div className="grid gap-2">
          <DraftFieldLabel htmlFor="event-v2-what-to-bring" optional className="text-sm">
            Qué llevar y qué no llevar
          </DraftFieldLabel>
          <Textarea
            id="event-v2-what-to-bring"
            rows={5}
            className={DRAFT_TEXTAREA_CLASS}
            placeholder="Ej. Llevá DNI. No se permiten mochilas grandes ni sillas."
            {...register("whatToBring")}
          />
          <DraftHint>Consejos prácticos para el día del evento.</DraftHint>
          <DraftFieldError message={errors.whatToBring?.message} />
        </div>
      </div>
  )

  if (embedded) return body

  return (
    <DraftCard className="md:col-span-12">
      <div className="mb-5 flex items-center gap-2">
        <Info className="size-4 text-emerald-400" aria-hidden />
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          Información útil
        </h2>
      </div>
      {body}
    </DraftCard>
  )
}
