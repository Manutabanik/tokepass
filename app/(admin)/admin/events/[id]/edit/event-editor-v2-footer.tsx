"use client"

import { ArrowLeft, ArrowRight, Rocket, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { EditorV2StepId } from "@/lib/events/editor-v2-steps"
import { cn } from "@/lib/utils"

export function EventEditorV2StickyFooter({
  step,
  busy = false,
  saving = false,
  publishLabel = "Publicar",
  onBack,
  onSaveDraft,
  onNext,
  onPublish,
}: {
  step: EditorV2StepId
  busy?: boolean
  saving?: boolean
  publishLabel?: string
  onBack: () => void
  onSaveDraft: () => void
  onNext: () => void
  onPublish: () => void
}) {
  const firstStep = step === 1
  const lastStep = step === 3

  return (
    <footer className="fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-background/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={firstStep || busy}
          className="h-12 min-h-12 shrink-0"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Atrás
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || saving}
          className="h-12 min-h-12 shrink-0"
          onClick={onSaveDraft}
        >
          <Save className="size-4" aria-hidden />
          {saving ? "Guardando…" : "Guardar Borrador"}
        </Button>
        {lastStep ? (
          <Button
            type="button"
            disabled={busy}
            className="h-12 min-h-12 min-w-40 bg-emerald-500 text-black hover:bg-emerald-400"
            onClick={onPublish}
          >
            <Rocket className="size-4" aria-hidden />
            {publishLabel}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={busy}
            className="h-12 min-h-12"
            onClick={onNext}
          >
            Siguiente
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </footer>
  )
}

export function EventEditorTabAlertDot({
  tone,
  className,
}: {
  tone: "error" | "warn" | null
  className?: string
}) {
  if (!tone) return null
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "error" ? "bg-red-500" : "bg-amber-400",
        className,
      )}
    />
  )
}
