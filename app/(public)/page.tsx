import type { Metadata } from "next"

import { getPublishedEvents } from "@/app/actions/public-events"
import { AnimatedBackground } from "@/components/discovery/animated-background"
import { DiscoveryHub } from "@/components/discovery/discovery-hub"

export const metadata: Metadata = {
  title: "Tokepass — Tu próxima gran noche",
  description:
    "Fiestas, festivales y las mejores noches de tu ciudad. Entradas digitales seguras que funcionan sin internet.",
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  let events: Awaited<ReturnType<typeof getPublishedEvents>> = []
  let loadError: string | null = null

  try {
    events = await getPublishedEvents(q)
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar los eventos."
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-28 lg:pt-10">
        {loadError ? (
          <div className="mt-16 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-10 text-center text-sm text-red-700 dark:text-red-200">
            {loadError}
          </div>
        ) : (
          <DiscoveryHub events={events} initialQuery={q ?? ""} />
        )}
      </div>
    </div>
  )
}
