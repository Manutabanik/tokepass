"use client"

import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"

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
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-300 shadow-[0_0_18px_rgba(6,182,212,0.2)]">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
          {title}
        </h2>
      </div>

      <motion.div
        className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05 } },
        }}
      >
        {events.map((event, index) => (
          <div
            key={event.id}
            className="w-[82vw] max-w-[320px] shrink-0 sm:w-auto sm:max-w-none"
          >
            <EventCard event={event} index={index} priority={index < 2} />
          </div>
        ))}
      </motion.div>
    </section>
  )
}
