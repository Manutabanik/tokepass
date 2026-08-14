"use client"

import { Cloud, CloudOff, LoaderCircle } from "lucide-react"

import {
  useEventFormStore,
  type AutosaveStatus,
} from "@/lib/stores/event-form-store"
import { cn } from "@/lib/utils"

const LABELS: Record<AutosaveStatus, string> = {
  idle: "Sin cambios pendientes",
  dirty: "Cambios sin sincronizar…",
  saving: "Guardando cambios…",
  saved: "Todos los cambios guardados automáticamente",
  error: "No se pudo autoguardar",
}

export function EventAutosaveIndicator({ className }: { className?: string }) {
  const status = useEventFormStore((s) => s.autosaveStatus)
  const error = useEventFormStore((s) => s.autosaveError)

  if (status === "idle") return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
        status === "saving" || status === "dirty"
          ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          : status === "error"
            ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
        className,
      )}
    >
      {status === "saving" || status === "dirty" ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      ) : status === "error" ? (
        <CloudOff className="size-3.5" aria-hidden />
      ) : (
        <Cloud className="size-3.5" aria-hidden />
      )}
      <span>
        {status === "saving"
          ? "Guardando…"
          : status === "saved"
            ? LABELS.saved
            : status === "error"
              ? error || LABELS.error
              : LABELS[status]}
      </span>
    </div>
  )
}
