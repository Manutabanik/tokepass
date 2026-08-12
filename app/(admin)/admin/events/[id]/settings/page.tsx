import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventCommercialSettings } from "@/app/actions/events"
import { EventCommercialSettingsForm } from "@/components/admin/event-commercial-settings-form"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Ajustes de ventas del evento",
}

export default async function EventCommercialSettingsPage({
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
    redirect(`/login-organizador?next=/admin/events/${id}/settings`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    redirect(`/admin/events/${id}`)
  }

  const settings = await getEventCommercialSettings(id)
  if (!settings) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver al evento
      </Link>

      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300/80">
          SuperAdmin
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
          Settings comerciales
        </h1>
        <p className="mt-2 text-sm text-zinc-400">{settings.title}</p>
      </header>

      <EventCommercialSettingsForm initial={settings} />
    </main>
  )
}
