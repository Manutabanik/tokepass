import type { Metadata } from "next"

import { getOrganizerEvents } from "@/app/actions/events"
import { OrganizerEventsManager } from "@/components/admin/organizer-events-manager"

export const metadata: Metadata = {
  title: "Mis Eventos",
  description: "Administrá tu cartelera y destacá eventos con TokePass Boost.",
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ boost?: string }>
}) {
  const { boost } = await searchParams
  let events: Awaited<ReturnType<typeof getOrganizerEvents>> = []
  try {
    events = await getOrganizerEvents()
  } catch {
    events = []
  }

  const boostHint =
    boost === "success" || boost === "pending" || boost === "failure"
      ? boost
      : null

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <OrganizerEventsManager events={events} boostHint={boostHint} />
    </div>
  )
}
