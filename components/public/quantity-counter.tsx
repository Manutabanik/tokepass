"use client"

import { Minus, Plus } from "lucide-react"

import { cn, tapFeedbackClass } from "@/lib/utils"

export function QuantityCounter({
  quantity,
  min = 0,
  max,
  disabled = false,
  compact = false,
  onDecrease,
  onIncrease,
  decreaseLabel = "Quitar",
  increaseLabel = "Agregar",
  className,
}: {
  quantity: number
  min?: number
  max: number
  disabled?: boolean
  compact?: boolean
  onDecrease: () => void
  onIncrease: () => void
  decreaseLabel?: string
  increaseLabel?: string
  className?: string
}) {
  const isActive = quantity > 0
  const canDecrease = !disabled && quantity > min
  const canIncrease = !disabled && quantity < max

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-full border transition-all duration-300",
        compact ? "h-7 w-[4.75rem]" : "h-9 w-28",
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300",
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        aria-label={decreaseLabel}
        className={cn(
          tapFeedbackClass,
          "flex h-full items-center justify-center rounded-l-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "w-7" : "w-9",
          isActive
            ? "text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
            : "text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700",
        )}
      >
        <Minus className={compact ? "size-3" : "size-4"} aria-hidden="true" />
      </button>

      <span
        className={cn(
          "select-none text-center font-black tabular-nums",
          compact ? "w-5 text-xs" : "w-6 text-sm",
        )}
      >
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        aria-label={increaseLabel}
        className={cn(
          tapFeedbackClass,
          "flex h-full items-center justify-center rounded-r-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "w-7" : "w-9",
          isActive
            ? "text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
            : "text-zinc-800 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700",
        )}
      >
        <Plus className={compact ? "size-3" : "size-4"} aria-hidden="true" />
      </button>
    </div>
  )
}
