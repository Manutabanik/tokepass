import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getComplimentaryTiers } from "@/app/actions/complimentary"
import {
  listEventTicketTemplates,
  listPrintBatches,
} from "@/app/actions/print-studio-core"
import { PrintStudioWorkspace } from "@/components/admin/print-studio/print-studio-workspace"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Print Studio",
  description: "Plantillas en milímetros y emisión de lotes impresos o acreditaciones.",
}

export default async function EventPrintStudioPage({
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
    redirect(`/login-organizador?next=/admin/events/${eventId}/print-studio`)
  }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select("id, title, organizer_id, flyer_url, image_url")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) notFound()
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    redirect("/admin/events")
  }

  const [tiers, templates, batches] = await Promise.all([
    getComplimentaryTiers(eventId),
    listEventTicketTemplates(eventId),
    listPrintBatches(eventId),
  ])

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/admin/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver al centro de mando
      </Link>

      <PrintStudioWorkspace
        eventId={event.id}
        eventTitle={event.title}
        flyerUrl={event.flyer_url || event.image_url}
        tiers={tiers}
        templates={templates}
        batches={batches}
      />
    </main>
  )
}
