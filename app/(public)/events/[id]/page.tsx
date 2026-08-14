import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import {
  getEventAccessGate,
  getEventDetails,
} from "@/app/actions/public-events"
import { EventUnavailableNotice } from "@/components/public/event-unavailable-notice"
import {
  buildEventMetadata,
  eventSeoFromDetails,
} from "@/lib/seo/event-metadata"
import { publicEventPath } from "@/lib/seo/site"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const event = await getEventDetails(id)

  if (!event) {
    return { title: "Evento no encontrado" }
  }

  return buildEventMetadata(eventSeoFromDetails(event))
}

export default async function LegacyEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { id } = await params
  const { ref } = await searchParams
  const event = await getEventDetails(id).catch(() => null)

  if (!event) {
    const gate = await getEventAccessGate(id)
    if (
      gate &&
      (gate.status === "paused" ||
        gate.status === "draft" ||
        gate.status === "cancelled")
    ) {
      return (
        <EventUnavailableNotice title={gate.title} status={gate.status} />
      )
    }
    notFound()
  }

  const path = publicEventPath(event)
  const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : ""
  permanentRedirect(`${path}${suffix}`)
}
