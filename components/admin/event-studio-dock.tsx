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
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="ghost"
        disabled={!canGoBack || submitting}
        onClick={onBack}
        className="min-h-11 text-base text-muted-foreground hover:text-foreground md:text-sm"
      >
        <ArrowLeft />
        Anterior
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={submitting || nextDisabled}
          className="min-h-11 text-base md:text-sm"
        >
          {submitting ? <LoaderCircle className="animate-spin" /> : <Save />}
          {submitting ? "Guardando..." : "Guardar"}
        </Button>
        {!isLast ? (
          <Button
            type="button"
            disabled={nextDisabled || submitting}
            onClick={onNext}
            className="min-h-11 bg-gradient-to-r from-emerald-500 to-cyan-500 text-base font-semibold text-zinc-950 hover:from-emerald-400 hover:to-cyan-400 md:text-sm"
          >
            Continuar
            <ArrowRight />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={submitting}
            onClick={onPublish}
            className="min-h-11 bg-gradient-to-r from-emerald-500 to-cyan-500 text-base font-semibold text-zinc-950 hover:from-emerald-400 hover:to-cyan-400 md:text-sm"
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Rocket />
            )}
            {isEditing ? "Publicar / Guardar" : "Publicar"}
          </Button>
        )}
      </div>
    </div>
  )
}
