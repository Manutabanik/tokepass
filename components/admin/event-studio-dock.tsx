"use client"

import { ArrowLeft, ArrowRight, LoaderCircle, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { STUDIO_SECONDARY_BUTTON_CLASS } from "@/lib/admin/studio-form-styles"
import { cn } from "@/lib/utils"

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
        className={cn(STUDIO_SECONDARY_BUTTON_CLASS, "h-12 shrink-0 px-4 text-sm")}
      >
        {submitting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Save className="size-4 shrink-0" />
        )}
        Guardar como borrador
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
          aria-label="Lanzar evento a la venta"
          className="h-12 flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-base font-bold text-white shadow-lg shadow-fuchsia-500/30 hover:from-violet-500 hover:to-fuchsia-400"
        >
          {submitting ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <span aria-hidden="true">🚀</span>
          )}
          ¡Lanzar evento a la venta!
        </Button>
      )}
    </div>
  )
}
