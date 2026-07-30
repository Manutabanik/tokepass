import type { Metadata } from "next"

import { getPublishedEvents } from "@/app/actions/public-events"
import { AnimatedBackground } from "@/components/discovery/animated-background"
import { DiscoveryHub } from "@/components/discovery/discovery-hub"

export const metadata: Metadata = {
  title: "Eventos",
  description:
    "Descubrí fiestas, festivales y noches en Tokepass. Filtrá por vibra y conseguí tu entrada.",
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const events = await getPublishedEvents(q)

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-[#030712] text-zinc-100">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-4 sm:px-6 lg:px-8">
        <DiscoveryHub events={events} initialQuery={q ?? ""} />
      </div>
    </div>
  )
}
