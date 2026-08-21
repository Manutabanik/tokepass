import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"

import {
  getEventDetailsForPreviewKey,
  type EventDetails,
} from "@/app/actions/public-events"
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
import { normalizePreviewKey } from "@/lib/preview/sandbox"
import {
  buildEventMetadata,
  buildNoindexEventMetadata,
  eventSeoFromDetails,
  isSeoHiddenEventStatus,
} from "@/lib/seo/event-metadata"
import { decodeEventParam } from "@/lib/seo/event-slug"

export const revalidate = 30
export const dynamicParams = true

type EventPageSearch = {
  preview_key?: string | string[]
}

async function loadPublishedEvent(rawSlug: string): Promise<EventDetails | null> {
  const fullSlug = decodeURIComponent(rawSlug)
  let event = await cachedEventDetails(fullSlug).catch(() => null)
  if (event) return event
  const decodedSlug = decodeEventParam(rawSlug)
  if (decodedSlug !== fullSlug) {
    event = await cachedEventDetails(decodedSlug).catch(() => null)
  }
  return event
}

async function loadPreviewEvent(
  rawSlug: string,
  previewKey: string,
): Promise<EventDetails | null> {
  const fullSlug = decodeURIComponent(rawSlug)
  let event = await getEventDetailsForPreviewKey(fullSlug, previewKey)
  if (event) return event
  const decodedSlug = decodeEventParam(rawSlug)
  if (decodedSlug !== fullSlug) {
    event = await getEventDetailsForPreviewKey(decodedSlug, previewKey)
  }
  return event
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<EventPageSearch>
}): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const query = await searchParams
  const previewKey = normalizePreviewKey(query.preview_key)

  const published = await loadPublishedEvent(rawSlug)
  if (published) {
    return buildEventMetadata(eventSeoFromDetails(published))
  }

  if (previewKey) {
    const preview = await loadPreviewEvent(rawSlug, previewKey)
    if (preview) {
      return {
        ...buildEventMetadata(eventSeoFromDetails(preview)),
        robots: { index: false, follow: false },
      }
    }
  }

  const fullSlug = decodeURIComponent(rawSlug)
  const decodedSlug = decodeEventParam(rawSlug)
  const gate = await cachedEventAccessGate(
    decodedSlug !== fullSlug ? decodedSlug : fullSlug,
  )
  if (gate && isSeoHiddenEventStatus(gate.status)) {
    return buildNoindexEventMetadata(gate.title)
  }

  return { title: "Evento no encontrado", robots: { index: false, follow: false } }
}

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<EventPageSearch>
}) {
  const { slug: rawSlug } = await params
  const query = await searchParams
  const previewKey = normalizePreviewKey(query.preview_key)
  const fullSlug = decodeURIComponent(rawSlug)

  let event = await loadPublishedEvent(rawSlug)

  if (!event && previewKey) {
    event = await loadPreviewEvent(rawSlug, previewKey)
    if (!event) {
      notFound()
    }
  }

  if (!event) {
    const decodedSlug = decodeEventParam(rawSlug)
    const gate = await cachedEventAccessGate(
      decodedSlug !== fullSlug ? decodedSlug : fullSlug,
    )
    if (
      gate?.status === "draft" ||
      gate?.status === "pending_approval" ||
      gate?.status === "needs_revision" ||
      gate?.status === "rejected"
    ) {
      notFound()
    }
    if (gate && (gate.status === "paused" || gate.status === "cancelled")) {
      return (
        <EventUnavailableNotice title={gate.title} status={gate.status} />
      )
    }
    notFound()
  }

  const isDraftPreview = Boolean(event.isDraftPreview)
  const locationText = event.venue?.location ?? event.location ?? ""
  const province = locationText.split(",")[0]?.trim() ?? ""

  const [resaleListings, relatedEvents] = await Promise.all([
    isDraftPreview
      ? Promise.resolve([])
      : cachedResaleListings(event.id).catch(() => []),
    isDraftPreview
      ? Promise.resolve([])
      : cachedRelatedEvents(
          event.id,
          event.categoryId ?? "",
          province,
          4,
        ).catch(() => []),
  ])

  const seo = eventSeoFromDetails(event)

  return (
    <div className="relative bg-background">
      {isDraftPreview ? null : <EventSchemaScript {...seo} />}
      <Suspense fallback={null}>
        <EventStorefrontSession
          event={event}
          resaleListings={resaleListings}
          previewKey={previewKey}
        />
      </Suspense>
      {isDraftPreview ? null : (
        <StorefrontChromeGate>
          <RelatedEventsSection events={relatedEvents} />
        </StorefrontChromeGate>
      )}
    </div>
  )
}
