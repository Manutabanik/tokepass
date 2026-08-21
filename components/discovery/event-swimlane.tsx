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
      <div className="no-scrollbar flex w-full max-w-full snap-x snap-mandatory scroll-smooth gap-4 overflow-x-auto">
        {events.map((event, index) => (
          <div
            key={event.id}
            className="w-[min(18rem,calc(100%-1.5rem))] shrink-0 snap-start sm:w-80 lg:w-[22rem]"
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
