import type { Metadata } from "next"

import { WaitingRoomClient } from "@/components/waiting-room/waiting-room-client"

export const metadata: Metadata = {
  title: "Fila virtual",
  description: "Hay mucha demanda. Te avisamos cuando haya lugar.",
  robots: { index: false, follow: false },
}

export default async function WaitingRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; next?: string }>
}) {
  const { event, next } = await searchParams
  const eventKey = event?.trim() || ""
  const nextPath =
    next?.startsWith("/") && !next.startsWith("//")
      ? next
      : eventKey
        ? `/eventos/${eventKey}`
        : "/"

  return <WaitingRoomClient eventKey={eventKey} nextPath={nextPath} />
}
