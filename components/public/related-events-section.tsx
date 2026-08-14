import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import { cn } from "@/lib/utils"

export function RelatedEventsSection({
  events,
  title = "También te puede interesar",
  className,
}: {
  events: CatalogEvent[]
  title?: string
  className?: string
}) {
  if (events.length === 0) return null

  return (
    <section
      aria-labelledby="related-events-heading"
      className={cn(
        "border-t border-border bg-background pb-28 lg:pb-12",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 lg:px-6 lg:py-12">
        <h2
          id="related-events-heading"
          className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
        >
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Más eventos como este, cerca en fecha o del mismo estilo.
        </p>

        <div
          className={cn(
            "-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2",
            "scrollbar-none md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4",
          )}
        >
          {events.map((event, index) => (
            <div
              key={event.id}
              className="w-[85vw] max-w-[320px] shrink-0 snap-center sm:w-[300px] md:w-auto md:max-w-none"
            >
              <EventCard event={event} index={index} priority={index < 2} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
