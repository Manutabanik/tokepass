"use client"

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { useFormContext } from "react-hook-form"

import { DraftFieldError } from "./event-editor-v2-ui"
import { uploadEventDraftMediaV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

const ACCEPT = "image/png,image/jpeg,image/webp"

export function EventEditorV2MediaField({
  eventId,
  name,
  label,
  hint,
}: {
  eventId: string
  name: "flyerUrl" | "bannerUrl"
  label: string
  hint: string
}) {
  const { setValue, watch } = useFormContext<EventDraftV2>()
  const url = watch(name)
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
          <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
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
        className="relative flex min-h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white/40 text-left dark:border-zinc-800 dark:bg-zinc-950/40"
      >
        {url ? (
          <img src={url} alt={label} className="absolute inset-0 size-full object-cover" />
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
