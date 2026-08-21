"use client"

import { ArrowLeft, ArrowRight, LoaderCircle, Rocket, Save } from "lucide-react"

import { Button } from "@/components/ui/button"

export function EventStudioDock({
  canGoBack,
  isLast,
  isEditing,
  submitting,
  nextDisabled = false,
  onBack,
  onNext,
  onPublish,
}: {
  canGoBack: boolean
  isLast: boolean
  isEditing: boolean
  submitting: boolean
  nextDisabled?: boolean
  onBack: () => void
  onNext: () => void
  onPublish: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="ghost"
        disabled={!canGoBack || submitting}
        onClick={onBack}
        aria-label="Volver al paso anterior"
        className="h-12 shrink-0 rounded-xl px-3 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-5 shrink-0" />
        <span className="hidden sm:inline">Volver al paso anterior</span>
      </Button>
      <Button
        type="submit"
        variant="outline"
        disabled={submitting || nextDisabled}
        className="h-12 shrink-0 rounded-xl border-white/10 bg-black/40 px-4 text-sm font-semibold"
      >
        {submitting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Save className="size-4 shrink-0" />
        )}
        Guardar avance
      </Button>
      {!isLast ? (
        <Button
          type="button"
          disabled={nextDisabled || submitting}
          onClick={onNext}
          className="h-12 flex-1 rounded-xl bg-emerald-500 text-base font-bold text-black hover:bg-emerald-400"
        >
          Ir al siguiente paso
          <ArrowRight className="size-5 shrink-0" />
        </Button>
      ) : (
        <Button
          type="button"
          disabled={submitting}
          onClick={onPublish}
          aria-label={
            isEditing
              ? "Lanzar el evento a la venta"
              : "Lanzar evento a la venta"
          }
          className="h-12 flex-1 rounded-xl bg-purple-600 text-base font-bold text-white hover:bg-purple-500"
        >
          {submitting ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Rocket className="size-5 shrink-0" />
          )}
          ¡Lanzar evento a la venta!
        </Button>
      )}
    </div>
  )
}
