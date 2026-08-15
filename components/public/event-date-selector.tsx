"use client"

import { cn, tapFeedbackClass } from "@/lib/utils"

export type EventDateOption = {
  id: string
  weekday: string
  dayMonth: string
  label: string
}

export function EventDateSelector({
  dates,
  selectedId,
  onChange,
}: {
  dates: EventDateOption[]
  selectedId: string
  onChange: (id: string) => void
}) {
  if (dates.length === 0) return null

  return (
    <nav aria-label="Elegí la fecha" className="px-4 md:px-0">
      <div className="hide-scrollbar flex w-full gap-3 overflow-x-auto py-4">
        {dates.map((date) => {
          const selected = date.id === selectedId
          return (
            <button
              key={date.id}
              type="button"
              onClick={() => onChange(date.id)}
              aria-pressed={selected}
              aria-label={date.label}
              className={cn(
                tapFeedbackClass,
                "flex min-h-12 min-w-[80px] shrink-0 flex-col items-center justify-center rounded-2xl border px-4 py-3",
                selected
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-transparent bg-secondary/40 text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <span className="text-xs font-bold uppercase tracking-wider">
                {date.weekday}
              </span>
              <span className="mt-1 text-xl font-black">{date.dayMonth}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
