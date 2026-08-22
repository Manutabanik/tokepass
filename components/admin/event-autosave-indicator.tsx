"use client"

import { CheckCircle2, CloudOff, Loader2 } from "lucide-react"

import {
  useEventFormStore,
  type AutosaveStatus,
} from "@/lib/stores/event-form-store"
import { cn } from "@/lib/utils"

const LABELS: Record<AutosaveStatus, string> = {
  idle: "Todos los cambios guardados automáticamente",
  dirty: "Guardando cambios...",
  saving: "Guardando cambios...",
  saved: "Todos los cambios guardados automáticamente",
  error: "Error al guardar - Haz clic para reintentar",
}

export function EventAutosaveIndicator({
  className,
  onRetry,
}: {
  className?: string
  onRetry?: () => void
}) {
  const status = useEventFormStore((s) => s.autosaveStatus)
  const error = useEventFormStore((s) => s.autosaveError)
  const isBusy = status === "saving" || status === "dirty"
  const isError = status === "error"

  return (
    <button
      type="button"
      role="status"
      aria-live="polite"
      disabled={!isError}
      onClick={() => {
        if (isError) onRetry?.()
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs font-medium shadow-sm",
        isBusy
          ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : isError
            ? "cursor-pointer border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
        className,
      )}
    >
      {isBusy ? (
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-300"
          aria-hidden
        />
      ) : isError ? (
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      )}
      <span>{isError ? error || LABELS.error : LABELS[status]}</span>
    </button>
  )
}
