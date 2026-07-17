import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { EventCreationWizard } from "@/components/admin/event-creation-wizard"

export const metadata: Metadata = {
  title: "Crear evento",
}

export default function CreateEventPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/events"
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Mis Eventos
      </Link>

      <div className="mb-8">
        <p className="text-sm font-medium text-violet-400">Event Builder</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
          Diseña una experiencia inolvidable
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Configura la operación completa en cuatro pasos. Podrás guardar el
          evento como borrador antes de publicarlo.
        </p>
      </div>

      <EventCreationWizard />
    </div>
  )
}
