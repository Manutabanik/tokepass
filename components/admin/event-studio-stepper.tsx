"use client"

import { cn } from "@/lib/utils"

export type EventStudioStepItem = {
  index: number
  label: string
}

export function EventStudioStepper({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: EventStudioStepItem[]
  activeIndex: number
  onSelect: (index: number) => void
}) {
  const progress =
    steps.length <= 1 ? 100 : (Math.max(0, activeIndex) / (steps.length - 1)) * 100

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 h-0.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="flex items-center gap-1">
        {steps.map((step, visibleIndex) => {
          const active = visibleIndex === activeIndex
          const done = visibleIndex < activeIndex
          return (
            <li key={step.index} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(step.index)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition",
                  active
                    ? "text-emerald-300"
                    : done
                      ? "text-zinc-300"
                      : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold",
                    active
                      ? "bg-emerald-400 text-zinc-950 shadow-[0_0_10px_rgba(52,211,153,0.55)]"
                      : done
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400",
                  )}
                >
                  {visibleIndex + 1}
                </span>
                <span className="truncate text-[11px] font-semibold tracking-wide">
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
