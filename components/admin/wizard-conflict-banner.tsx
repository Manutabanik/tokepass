"use client"

import type { WizardConflict } from "@/lib/seating/venue-map-sku-consistency"
import { cn } from "@/lib/utils"

export function WizardConflictBanner({
  conflict,
  title,
  onGoToStep,
  onRetry,
}: {
  conflict: WizardConflict
  title?: string
  onGoToStep: (step: number, sectorId?: string, field?: string) => void
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200"
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <p>{conflict.summary}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {conflict.actions.map((action) => (
          <button
            key={`${action.step}-${action.label}`}
            type="button"
            onClick={() =>
              onGoToStep(action.step, conflict.sectorId, action.field)
            }
            className={cn(
              "inline-flex h-11 min-h-11 items-center justify-center rounded-full border border-red-400/40 px-4 text-xs font-semibold",
              "text-red-900 transition hover:bg-red-500/15 dark:text-red-100",
            )}
          >
            {action.label}
          </button>
        ))}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-11 min-h-11 items-center justify-center rounded-full border border-red-400/40 px-4 text-xs font-semibold",
              "text-red-900 transition hover:bg-red-500/15 dark:text-red-100",
            )}
          >
            Reintentar guardado
          </button>
        ) : null}
      </div>
    </div>
  )
}
