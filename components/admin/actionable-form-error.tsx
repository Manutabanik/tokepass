"use client"

import { cn } from "@/lib/utils"

export function ActionableFormError({
  title,
  description,
  onFixField,
  onRetry,
  className,
}: {
  title: string
  description: string
  onFixField?: () => void
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "space-y-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p>{description}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {onFixField ? (
          <button
            type="button"
            onClick={onFixField}
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-full border border-red-400/40 px-4 text-xs font-semibold text-red-900 transition hover:bg-red-500/15 dark:text-red-100"
          >
            Corregir campo
          </button>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-full border border-red-400/40 px-4 text-xs font-semibold text-red-900 transition hover:bg-red-500/15 dark:text-red-100"
          >
            Reintentar guardado
          </button>
        ) : null}
      </div>
    </div>
  )
}
