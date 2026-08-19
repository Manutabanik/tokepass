import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import {
  getEventAccessGate,
  getEventDetails,
  getEventDetailsForPreviewKey,
} from "@/app/actions/public-events"
import { EventUnavailableNotice } from "@/components/public/event-unavailable-notice"
import { normalizePreviewKey, withPreviewKey } from "@/lib/preview/sandbox"
import {
  buildEventMetadata,
  eventSeoFromDetails,
} from "@/lib/seo/event-metadata"
import { extractAffiliateCode } from "@/lib/rrpp"
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
  searchParams: Promise<{ ref?: string; rrpp?: string; preview_key?: string | string[] }>
}) {
  const { id } = await params
  const query = await searchParams
  const previewKey = normalizePreviewKey(query.preview_key)
  let event = await getEventDetails(id).catch(() => null)

  if (!event && previewKey) {
    event = await getEventDetailsForPreviewKey(id, previewKey)
    if (!event) {
      notFound()
    }
  }

  if (!event) {
    const gate = await getEventAccessGate(id)
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

  const path = publicEventPath(event)
  const code = extractAffiliateCode(
    new URLSearchParams({
      ...(query.rrpp ? { rrpp: query.rrpp } : {}),
      ...(query.ref ? { ref: query.ref } : {}),
    }),
  )
  const suffix = code ? `?rrpp=${encodeURIComponent(code)}` : ""
  permanentRedirect(withPreviewKey(`${path}${suffix}`, previewKey))
}
