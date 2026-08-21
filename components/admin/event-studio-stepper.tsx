"use client"

import { cn } from "@/lib/utils"

export type EventStudioStepItem = {
  index: number
  label: string
  description?: string
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
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {steps.map((step, visibleIndex) => {
        const active = visibleIndex === activeIndex
        return (
          <button
            key={step.index}
            type="button"
            onClick={() => onSelect(step.index)}
            className={cn(
              "rounded-2xl border px-4 py-4 text-left transition",
              active
                ? "border-emerald-500/30 bg-muted/30"
                : "border-white/10 bg-card/40 opacity-60 hover:opacity-80",
            )}
          >
            <p className="text-sm font-bold text-foreground">
              {visibleIndex + 1}. {step.label}
            </p>
            {step.description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
