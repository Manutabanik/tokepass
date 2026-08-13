import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventMarketingSettings } from "@/app/actions/event-marketing"
import { EventMarketingPixelsForm } from "@/components/admin/event-marketing-pixels-form"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Marketing · Píxeles",
  description: "Configurá Meta, TikTok y GA4 para este evento.",
}

export default async function EventMarketingPage({
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
    redirect(`/login-organizador?next=/admin/events/${id}/marketing`)
  }

  const settings = await getEventMarketingSettings(id)
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
        className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a operación del evento
      </Link>

      <header>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          Marketing
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {settings.eventTitle} · píxeles de conversión en la ficha y el
          checkout.
        </p>
      </header>

      <EventMarketingPixelsForm initial={settings} />
    </main>
  )
}
