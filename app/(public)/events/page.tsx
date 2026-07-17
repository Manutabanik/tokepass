import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Eventos",
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-violet-600">Cartelera</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">
        {q ? `Resultados para “${q}”` : "Encuentra tu próximo evento"}
      </h1>
      <p className="mt-4 text-zinc-600">
        El catálogo se conectará aquí con los eventos publicados en Supabase.
      </p>
    </section>
  )
}
