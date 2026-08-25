"use client"

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react"
import Image from "next/image"
import { useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { DraftFieldError, DraftFieldLabel } from "./event-editor-v2-ui"
import { uploadEventDraftMediaV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

const ACCEPT = "image/png,image/jpeg,image/webp"

export function EventEditorV2MediaField({
  eventId,
  name,
  label,
  hint,
  optional = false,
}: {
  eventId: string
  name: "flyerUrl" | "bannerUrl"
  label: string
  hint: string
  optional?: boolean
}) {
  const { control, setValue } = useFormContext<EventDraftV2>()
  const url = useWatch({ control, name })
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function onFileChange(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError("")
    const formData = new FormData()
    formData.set("file", file)
    formData.set("kind", name === "bannerUrl" ? "banner" : "flyer")
    const result = await uploadEventDraftMediaV2(eventId, formData)
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setValue(name, result.url, { shouldDirty: true, shouldTouch: true })
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <DraftFieldLabel required={!optional} optional={optional} className="text-sm">
            {label}
          </DraftFieldLabel>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Quitar ${label.toLowerCase()}`}
            disabled={busy}
            onClick={() => {
              setValue(name, "", { shouldDirty: true, shouldTouch: true })
              if (inputRef.current) inputRef.current.value = ""
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          void onFileChange(file)
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="relative flex min-h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white/40 text-left transition-all duration-200 hover:border-emerald-500/40 dark:border-gray-700 dark:bg-gray-950/40"
      >
        {url ? (
          <Image
            src={url}
            alt={label}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
            {busy ? (
              <LoaderCircle className="size-6 animate-spin" />
            ) : (
              <ImagePlus className="size-6 text-emerald-400" />
            )}
            {busy ? "Subiendo…" : "Elegí una imagen JPG, PNG o WEBP"}
          </span>
        )}
      </button>
      <DraftFieldError message={error} />
    </div>
  )
}
