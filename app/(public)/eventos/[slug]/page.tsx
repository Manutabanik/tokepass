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
  const event = await cachedEventDetails(decodeEventParam(rawSlug))

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
  const slug = decodeEventParam(rawSlug)
  const event = await cachedEventDetails(slug).catch(() => null)

  if (!event) {
    const gate = await cachedEventAccessGate(slug)
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
