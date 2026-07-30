import { ArrowLeft, Pencil } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventForEditing } from "@/app/actions/events"
import { listOrganizerVenues } from "@/app/actions/venues"
import { EventCreationWizard } from "@/components/admin/event-creation-wizard"
import { getOrganizerServiceChargeRate } from "@/lib/services/organizer-pricing"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Editar evento",
  description: "Actualizá la experiencia, el recinto y sus entradas.",
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/admin/events/${id}/edit`)
  }

  const [initialData, venues] = await Promise.all([
    getEventForEditing(id),
    listOrganizerVenues().catch(() => []),
  ])

  if (!initialData) notFound()
  const organizerServiceRate = await getOrganizerServiceChargeRate(
    initialData.organizerId,
  )

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/admin/events"
        className="inline-flex w-fit items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Mis eventos
      </Link>

      <header>
        <p className="mb-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">
          <Pencil className="size-3.5" aria-hidden="true" />
          Event Editor
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Editar experiencia: {initialData.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Actualizá la identidad, el recinto y la estrategia de entradas. Los
          cambios se aplican de forma atómica sin alterar órdenes históricas.
        </p>
      </header>

      <EventCreationWizard
        initialData={initialData}
        organizerServiceRate={organizerServiceRate}
        venues={venues}
      />
    </main>
  )
}
