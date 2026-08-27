"use client"

import { ArrowLeft, ArrowRight, Rocket } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { EditorV2StepId } from "@/lib/events/editor-v2-steps"
import { cn } from "@/lib/utils"

export function EventEditorV2StickyFooter({
  step,
  busy = false,
  publishLabel = "Publicar",
  onBack,
  onNext,
  onPublish,
}: {
  step: EditorV2StepId
  busy?: boolean
  publishLabel?: string
  onBack: () => void
  onNext: () => void
  onPublish: () => void
}) {
  const firstStep = step === 1
  const lastStep = step === 3

  return (
    <footer className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-between border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
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
            Siguiente paso
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
