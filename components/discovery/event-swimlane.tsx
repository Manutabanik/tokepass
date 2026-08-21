"use client"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { cn } from "@/lib/utils"

export function EventSwimlane({
  events,
  categories,
  className,
}: {
  events: CatalogEvent[]
  categories?: DiscoveryCategory[]
  className?: string
}) {
  if (events.length === 0) return null

  return (
    <div className={cn("relative", className)}>
      <div className="flex snap-x snap-mandatory scroll-smooth gap-6 overflow-x-auto scrollbar-hide">
        {events.map((event, index) => (
          <div
            key={event.id}
            className="w-[85vw] flex-none snap-start sm:w-[320px] lg:w-[350px]"
          >
            <EventCard
              event={event}
              index={index}
              priority={index < 2}
              categories={categories}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
