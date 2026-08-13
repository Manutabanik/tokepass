import type { Metadata } from "next"

import { getOrganizerEvents } from "@/app/actions/events"
import { OrganizerEventsManager } from "@/components/admin/organizer-events-manager"

export const metadata: Metadata = {
  title: "Mis Eventos",
  description: "Administrá tu cartelera y destacá eventos con Tokepass Boost.",
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ boost?: string }>
}) {
  const { boost } = await searchParams
  const events = await getOrganizerEvents()

  const boostHint =
    boost === "success" || boost === "pending" || boost === "failure"
      ? boost
      : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <OrganizerEventsManager events={events} boostHint={boostHint} />
    </div>
  )
}
