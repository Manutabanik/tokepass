"use client"

import { CheckCircle2, CloudOff, Loader2 } from "lucide-react"

import type { DebouncedAutosaveStatus } from "@/hooks/use-debounced-autosave"
import { cn } from "@/lib/utils"

const LABELS: Record<DebouncedAutosaveStatus, string> = {
  idle: "",
  dirty: "Sin guardar",
  saving: "Guardando...",
  saved: "Guardado",
  error: "No se pudo guardar",
}

export function VenueAutosaveBadge({
  status,
  className,
}: {
  status: DebouncedAutosaveStatus
  className?: string
}) {
  if (status === "idle") return null
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium whitespace-nowrap",
        status === "error"
          ? "text-red-600 dark:text-red-400"
          : status === "saved"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground",
        className,
      )}
    >
      {status === "saving" || status === "dirty" ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : status === "error" ? (
        <CloudOff className="size-3.5" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
      )}
      <span>
        {status === "saved" ? "Guardado ✔️" : LABELS[status]}
      </span>
    </p>
  )
}
