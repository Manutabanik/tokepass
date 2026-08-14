import { ArrowLeft, Clapperboard } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventMultimediaSettings } from "@/app/actions/event-multimedia"
import { EventMultimediaForm } from "@/components/admin/event-multimedia-form"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Multimedia & Experiencia",
  description: "Spot de YouTube/Vimeo y galería liviana del evento.",
}

export default async function EventMultimediaPage({
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
    redirect(`/login-organizador?next=/admin/events/${id}/multimedia`)
  }

  const settings = await getEventMultimediaSettings(id)
  if (!settings) {
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", id)
      .maybeSingle()
    if (!event) notFound()
    redirect("/admin/events")
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-400 transition hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a operación del evento
      </Link>

      <header>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          <Clapperboard className="size-3.5" aria-hidden />
          Experiencia
        </p>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          Multimedia & Experiencia
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {settings.eventTitle} · video embebido (sin Storage) y hasta 4 fotos.
        </p>
      </header>

      <EventMultimediaForm initial={settings} />
    </main>
  )
}
