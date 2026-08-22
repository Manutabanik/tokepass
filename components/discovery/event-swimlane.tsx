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
      <div className="scrollbar-hide flex w-full max-w-full snap-x snap-mandatory scroll-smooth gap-4 overflow-x-auto">
        {events.map((event, index) => (
          <EventCard
            key={event.id}
            event={event}
            index={index}
            priority={index < 2}
            categories={categories}
            className="md:w-80 md:max-w-[22rem] lg:w-[22rem]"
          />
        ))}
      </div>
    </div>
  )
}
