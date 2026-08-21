import type { CatalogEvent } from "@/app/actions/public-events"
import { EventSwimlane } from "@/components/discovery/event-swimlane"
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
        "relative z-10 mt-12 border-t border-black/5 bg-background/40 pb-32 pt-16 lg:mt-20 lg:pb-16 dark:border-white/10 dark:bg-white/[0.02]",
        className,
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2
            id="related-events-heading"
            className="text-2xl font-black tracking-tight text-foreground"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Más eventos como este, cerca en fecha o del mismo estilo.
          </p>
        </div>

        <EventSwimlane events={events} />
      </div>
    </section>
  )
}
