"use client"

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  LoaderCircle,
  RefreshCw,
  Rocket,
  Save,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { STUDIO_SECONDARY_BUTTON_CLASS } from "@/lib/admin/studio-form-styles"
import { usesWizardUpdateActions } from "@/lib/events/wizard-steps"
import { cn } from "@/lib/utils"

export function EventStudioDock({
  canGoBack,
  isLast,
  submitting,
  nextDisabled = false,
  previewDisabled = false,
  eventStatus = null,
  onBack,
  onNext,
  onPreview,
  onSaveDraft,
  onPublish,
  onUpdate,
}: {
  canGoBack: boolean
  isLast: boolean
  submitting: boolean
  nextDisabled?: boolean
  previewDisabled?: boolean
  eventStatus?: string | null
  onBack: () => void
  onNext: () => void
  onPreview: () => void
  onSaveDraft: () => void
  onPublish: () => void
  onUpdate: () => void
}) {
  const updateOnly = usesWizardUpdateActions(eventStatus)

  if (isLast) {
    return (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={!canGoBack || submitting}
          onClick={onBack}
          aria-label="Volver al paso anterior"
          className="h-12 shrink-0 rounded-xl px-3 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="hidden sm:inline">Volver</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={submitting || previewDisabled}
          onClick={onPreview}
          className={cn(STUDIO_SECONDARY_BUTTON_CLASS, "h-12 shrink-0 px-4 text-sm")}
        >
          <Eye className="size-4 shrink-0" />
          Previsualizar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={submitting || nextDisabled}
          onClick={onSaveDraft}
          className={cn(STUDIO_SECONDARY_BUTTON_CLASS, "h-12 shrink-0 px-4 text-sm")}
        >
          {submitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4 shrink-0" />
          )}
          {updateOnly ? "Guardar cambios" : "Guardar borrador"}
        </Button>
        <Button
          type="button"
          disabled={submitting}
          onClick={updateOnly ? onUpdate : onPublish}
          aria-label={updateOnly ? "Actualizar evento" : "Publicar evento"}
          className="h-12 min-w-[10rem] flex-1 rounded-xl bg-emerald-500 text-base font-bold text-black hover:bg-emerald-400"
        >
          {submitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : updateOnly ? (
            <RefreshCw className="size-4 shrink-0" />
          ) : (
            <Rocket className="size-4 shrink-0" />
          )}
          {updateOnly ? "Actualizar" : "Publicar evento"}
        </Button>
      </div>
    )
  }

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
        <ArrowLeft className="size-4 shrink-0" />
        <span className="hidden sm:inline">Volver al paso anterior</span>
      </Button>
      {updateOnly ? null : (
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
      )}
      <Button
        type="button"
        disabled={nextDisabled || submitting}
        onClick={onNext}
        className="h-12 flex-1 rounded-xl bg-emerald-500 text-base font-bold text-black hover:bg-emerald-400"
      >
        Ir al siguiente paso
        <ArrowRight className="size-4 shrink-0" />
      </Button>
    </div>
  )
}
