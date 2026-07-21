import type { Metadata } from "next"

import { getPublishedEvents } from "@/app/actions/public-events"
import { DiscoveryCatalog } from "@/components/public/discovery-catalog"

export const metadata: Metadata = {
  title: "Eventos",
  description: "Descubrí los mejores eventos y comprá tus entradas en Tokepass.",
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const events = await getPublishedEvents(q)

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]"
        aria-hidden="true"
      />

      <section className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
          Cartelera
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl">
          {q ? `Resultados para “${q}”` : "Todos los eventos"}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-zinc-400">
          Noches, festivales y productoras. Filtrá por vibra y entrá directo al
          checkout.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <DiscoveryCatalog events={events} initialQuery={q ?? ""} />
      </section>
    </div>
  )
}
