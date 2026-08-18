import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"

import { StorefrontChromeGate } from "@/components/layout/public-shell"
import { EventSchemaScript } from "@/components/public/event-schema-script"
import { EventStorefrontSession } from "@/components/public/event-storefront-session"
import { EventUnavailableNotice } from "@/components/public/event-unavailable-notice"
import { RelatedEventsSection } from "@/components/public/related-events-section"
import {
  cachedEventAccessGate,
  cachedEventDetails,
  cachedRelatedEvents,
  cachedResaleListings,
} from "@/lib/catalog/cached-public-reads"
import {
  buildEventMetadata,
  eventSeoFromDetails,
} from "@/lib/seo/event-metadata"
import { decodeEventParam } from "@/lib/seo/event-slug"

export const revalidate = 30
export const dynamicParams = true

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const fullSlug = decodeURIComponent(rawSlug)
  
  // Intenta por slug completo primero, luego por decodeEventParam
  let event = await cachedEventDetails(fullSlug).catch(() => null)
  if (!event) {
    const decodedSlug = decodeEventParam(rawSlug)
    if (decodedSlug !== fullSlug) {
      event = await cachedEventDetails(decodedSlug).catch(() => null)
    }
  }

  if (!event) {
    return { title: "Evento no encontrado" }
  }

  return buildEventMetadata(eventSeoFromDetails(event))
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug: rawSlug } = await params
  
  // 1. Decodificar el URI original directamente desde la URL
  const fullSlug = decodeURIComponent(rawSlug)

  // 2. Intentar buscar por el slug exacto
  let event = await cachedEventDetails(fullSlug).catch(() => null)
  let targetSlug = fullSlug

  // 3. Fallback: Si no lo encuentra, intentar decodificar el parámetro por si es un ID o slug procesado
  if (!event) {
    const decodedSlug = decodeEventParam(rawSlug)
    if (decodedSlug !== fullSlug) {
      event = await cachedEventDetails(decodedSlug).catch(() => null)
      if (event) {
        targetSlug = decodedSlug
      }
    }
  }

  // 4. Si sigue sin encontrarlo, verificar si el evento está pausado/cancelado/borrador
  if (!event) {
    const gate = await cachedEventAccessGate(targetSlug)
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

  const locationText = event.venue?.location ?? event.location ?? ""
  const province = locationText.split(",")[0]?.trim() ?? ""

  const [resaleListings, relatedEvents] = await Promise.all([
    cachedResaleListings(event.id).catch(() => []),
    cachedRelatedEvents(
      event.id,
      event.categoryId ?? "",
      province,
      4,
    ).catch(() => []),
  ])

  const seo = eventSeoFromDetails(event)

  return (
    <div className="relative">
      <EventSchemaScript {...seo} />
      <Suspense fallback={null}>
        <EventStorefrontSession
          event={event}
          resaleListings={resaleListings}
        />
      </Suspense>
      <StorefrontChromeGate>
        <RelatedEventsSection events={relatedEvents} />
      </StorefrontChromeGate>
    </div>
  )
}
