"use client"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { cn } from "@/lib/utils"

export function EventsCarousel({
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
    <div
      className={cn(
        "scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-8 -mx-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        "md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0",
        "lg:grid-cols-4",
        className,
      )}
    >
      {events.map((event, index) => (
        <EventCard
          key={event.id}
          event={event}
          index={index}
          priority={index < 4}
          categories={categories}
        />
      ))}
    </div>
  )
}
