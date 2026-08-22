"use client"

import useEmblaCarousel from "embla-carousel-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import type { DiscoveryCategory } from "@/lib/discovery-categories"

export function EventsCarousel({
  events,
  categories,
}: {
  events: CatalogEvent[]
  categories?: DiscoveryCategory[]
}) {
  const [emblaRef] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
    loop: false,
  })

  return (
    <div className="w-full overflow-hidden py-4" ref={emblaRef}>
      <div className="flex gap-4 touch-pan-y">
        {events.map((event, index) => (
          <div
            key={event.id}
            className="min-w-0 shrink-0 select-none flex-[0_0_220px] sm:flex-[0_0_260px]"
          >
            <EventCard
              event={event}
              index={index}
              priority={index < 4}
              categories={categories}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
