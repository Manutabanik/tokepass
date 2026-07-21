import type { Metadata } from "next"

import { getPublishedEvents } from "@/app/actions/public-events"
import { DiscoveryCatalog } from "@/components/public/discovery-catalog"

export const metadata: Metadata = {
  title: "Tokepass — La noche, sin fricción",
  description:
    "Descubrí fiestas, festivales y noches premium. Entradas digitales, checkout rápido y billetera Tokepass.",
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
    <div className="relative isolate min-h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.07),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_10%_20%,rgba(56,189,248,0.08),transparent_35%)]"
        aria-hidden="true"
      />

      <section className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-14">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
            Tokepass Discovery
          </p>
          <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-transparent sm:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-b from-white via-zinc-100 to-zinc-600 bg-clip-text">
              La noche, sin fricción.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
            Fiestas, festivales y productoras. Elegí tu noche, pagá en segundos
            y guardá la entrada en tu billetera digital.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        {loadError ? (
          <div className="rounded-[1.75rem] border border-red-500/20 bg-red-500/10 px-5 py-10 text-center text-sm text-red-200">
            {loadError}
          </div>
        ) : (
          <DiscoveryCatalog events={events} initialQuery={q ?? ""} />
        )}
      </section>
    </div>
  )
}
