"use client"

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react"
import Image from "next/image"
import { useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { DraftFieldError, DraftFieldLabel, DraftHint } from "./event-editor-v2-ui"
import { uploadEventDraftMediaV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import { EVENT_DRAFT_GALLERY_MAX, type EventDraftV2 } from "@/lib/validations/event-draft-v2"

const ACCEPT = "image/png,image/jpeg,image/webp"

export function EventEditorV2GalleryField({ eventId }: { eventId: string }) {
  const { control, setValue } = useFormContext<EventDraftV2>()
  const urls = useWatch({ control, name: "galleryUrls" }) ?? []
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const canAdd = urls.length < EVENT_DRAFT_GALLERY_MAX

  async function onFileChange(file: File | undefined) {
    if (!file || !canAdd) return
    setBusy(true)
    setError("")
    const formData = new FormData()
    formData.set("file", file)
    formData.set("kind", "gallery")
    const result = await uploadEventDraftMediaV2(eventId, formData)
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setValue("galleryUrls", [...urls, result.url].slice(0, EVENT_DRAFT_GALLERY_MAX), {
      shouldDirty: true,
      shouldTouch: true,
    })
    if (inputRef.current) inputRef.current.value = ""
  }

  function removeUrl(url: string) {
    setValue(
      "galleryUrls",
      urls.filter((item) => item !== url),
      { shouldDirty: true, shouldTouch: true },
    )
  }

  return (
    <div className="grid gap-2">
      <DraftFieldLabel optional className="text-sm">
        Galería
      </DraftFieldLabel>
      <DraftHint>
        Subí hasta {EVENT_DRAFT_GALLERY_MAX} fotos para La Experiencia.
      </DraftHint>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          void onFileChange(event.target.files?.[0])
        }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {urls.map((url) => (
          <div
            key={url}
            className="relative aspect-square overflow-hidden rounded-xl border border-border/50"
          >
            <Image
              src={url}
              alt="Foto de la experiencia"
              fill
              sizes="160px"
              className="object-cover"
              unoptimized
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-9 bg-black/50 text-white hover:bg-black/70 hover:text-white"
              aria-label="Quitar foto"
              onClick={() => removeUrl(url)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        {canAdd ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/40 text-xs text-muted-foreground transition-colors hover:border-emerald-500/40 dark:border-gray-700 dark:bg-gray-950/40"
          >
            {busy ? (
              <LoaderCircle className="size-6 animate-spin" />
            ) : (
              <ImagePlus className="size-6 text-emerald-400" />
            )}
            {busy ? "Subiendo…" : "Subir foto"}
          </button>
        ) : null}
      </div>
      <DraftFieldError message={error} />
    </div>
  )
}
