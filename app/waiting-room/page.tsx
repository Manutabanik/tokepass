import { redirect } from "next/navigation"

import { safeQueueNextPath } from "@/lib/waiting-room/paths"

/** Alias legacy → /event/[id]/queue */
export default async function WaitingRoomAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; next?: string }>
}) {
  const { event, next } = await searchParams
  const eventKey = event?.trim() || ""
  if (!eventKey) {
    redirect("/")
  }
  const nextPath = safeQueueNextPath(next, eventKey)
  redirect(
    `/event/${encodeURIComponent(eventKey)}/queue?next=${encodeURIComponent(nextPath)}`,
  )
}
