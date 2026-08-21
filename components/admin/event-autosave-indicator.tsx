"use client"

import { CheckCircle2, CloudOff, Loader2 } from "lucide-react"

import {
  useEventFormStore,
  type AutosaveStatus,
} from "@/lib/stores/event-form-store"
import { cn } from "@/lib/utils"

const LABELS: Record<AutosaveStatus, string> = {
  idle: "Cambios guardados",
  dirty: "Guardando...",
  saving: "Guardando...",
  saved: "Cambios guardados",
  error: "No pudimos guardar. Intentá de nuevo",
}

export function EventAutosaveIndicator({ className }: { className?: string }) {
  const status = useEventFormStore((s) => s.autosaveStatus)
  const error = useEventFormStore((s) => s.autosaveError)

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
        status === "saving" || status === "dirty"
          ? "border-border bg-card text-muted-foreground"
          : status === "error"
            ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
        className,
      )}
    >
      {status === "saving" || status === "dirty" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
      ) : status === "error" ? (
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      )}
      <span>
        {status === "error" ? error || LABELS.error : LABELS[status]}
      </span>
    </div>
  )
}
