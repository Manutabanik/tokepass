import { ArrowLeft, Package } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventBundleWorkspace } from "@/app/actions/ticket-bundles"
import { TicketBundleManager } from "@/components/admin/ticket-bundle-manager"
import { parseScheduleDays } from "@/lib/event-schedule"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Combos y tarifas",
  description: "Armá packs, abonos y tarifas especiales del evento.",
}

export default async function EventTiersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/admin/events/${eventId}/tiers`)
  }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select("id, title, organizer_id, schedule_days")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) notFound()
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    redirect("/admin/events")
  }

  const workspace = await getEventBundleWorkspace(eventId)

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/admin/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al centro de mando
      </Link>

      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
          Tarifas
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-foreground">
          <Package className="size-8" />
          Combos, abonos y kits
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
        Clasificá abonos, packs con extras y descuentos por volumen. El
        checkout reserva el stock de cada componente durante 8 minutos.
        </p>
      </header>

      <TicketBundleManager
        eventId={eventId}
        eventTitle={event.title}
        scheduleDays={parseScheduleDays(event.schedule_days)}
        initialTiers={workspace.tiers}
      />
    </main>
  )
}
