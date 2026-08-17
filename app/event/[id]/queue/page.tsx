import type { Metadata } from "next"

import { WaitingRoomClient } from "@/components/waiting-room/waiting-room-client"
import { safeQueueNextPath } from "@/lib/waiting-room/paths"

export const metadata: Metadata = {
  title: "Fila virtual",
  description: "Hay mucha demanda. Te avisamos cuando haya lugar.",
  robots: { index: false, follow: false },
}

export default async function EventQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ next?: string }>
}) {
  const { id } = await params
  const { next } = await searchParams
  const eventKey = decodeURIComponent(id).trim()

  return (
    <WaitingRoomClient
      eventKey={eventKey}
      nextPath={safeQueueNextPath(next, eventKey)}
    />
  )
}
