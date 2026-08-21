"use client"

import type { LucideIcon } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventSwimlane } from "@/components/discovery/event-swimlane"

export function EventRail({
  title,
  icon: Icon,
  events,
}: {
  title: string
  icon: LucideIcon
  events: CatalogEvent[]
}) {
  if (events.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="mb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border border-black/5 bg-muted text-cyan-700 shadow-[0_0_18px_rgba(6,182,212,0.15)] dark:border-white/10 dark:bg-white/5 dark:text-cyan-300">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
            {title}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {events.length} evento{events.length === 1 ? "" : "s"}
        </p>
      </div>

      <EventSwimlane events={events} />
    </section>
  )
}
