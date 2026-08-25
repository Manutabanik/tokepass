import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { createEventDraftV2 } from "@/app/actions/event-draft-v2"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Crear evento",
}

export default async function CreateEventPage({
  searchParams,
}: {
  searchParams: Promise<{ organizerId?: string }>
}) {
  const { organizerId: rawOrganizerId } = await searchParams
  const organizerId = rawOrganizerId?.trim() || undefined
  const nextPath = organizerId
    ? `/admin/events/create?organizerId=${encodeURIComponent(organizerId)}`
    : "/admin/events/create"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=${encodeURIComponent(nextPath)}`)
  }

  const result = await createEventDraftV2(
    organizerId ? { organizerId } : undefined,
  )

  if (!result.success) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">No se pudo crear el evento</h1>
        <p className="mt-3 text-sm text-muted-foreground">{result.error}</p>
        <Link
          href="/admin/events"
          className="mt-6 inline-flex text-sm font-semibold underline underline-offset-4"
        >
          Volver al panel
        </Link>
      </main>
    )
  }

  redirect(`/admin/events/${result.eventId}/edit`)
}
