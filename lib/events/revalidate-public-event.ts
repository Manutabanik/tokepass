import { revalidatePath, revalidateTag, updateTag } from "next/cache"

import { publicEventSlugsForRevalidate } from "@/lib/events/public-event-slugs"

const TAG_PROFILE = "seconds" as const

function invalidateCacheTag(tag: string) {
  updateTag(tag)
  revalidateTag(tag, TAG_PROFILE)
}

/**
 * Limpia ISR + Data Cache del evento en admin y en la vitrina publica.
 * Si el slug cambia, invalida la URL anterior y la nueva.
 */
export function revalidatePublicEventCache(input: {
  eventId: string
  slug?: string | null
  previousSlug?: string | null
}) {
  const eventId = input.eventId.trim()
  if (!eventId) return

  const slugs = publicEventSlugsForRevalidate(
    input.slug,
    input.previousSlug,
    eventId,
  )

  revalidatePath("/", "layout")
  revalidatePath("/eventos", "page")
  revalidatePath("/events", "layout")
  revalidatePath("/admin/events", "layout")
  revalidatePath(`/admin/events/${eventId}`, "layout")
  revalidatePath(`/admin/events/${eventId}/edit`, "layout")
  revalidatePath(`/events/${eventId}`, "page")
  revalidatePath(`/events/preview/${eventId}`, "page")
  revalidatePath(`/superadmin/events/${eventId}`, "page")

  for (const slug of slugs) {
    revalidatePath(`/eventos/${slug}`, "page")
    revalidatePath(`/eventos/${slug}/entradas`, "page")
    revalidatePath(`/e/${slug}`, "page")
    invalidateCacheTag(`event-${slug}`)
    invalidateCacheTag(`event-gate-${slug}`)
    invalidateCacheTag(`event-details-${slug}`)
  }

  invalidateCacheTag(`event-${eventId}`)
  invalidateCacheTag(`related-${eventId}`)
  invalidateCacheTag(`resale-${eventId}`)
  invalidateCacheTag("catalog-events")
  invalidateCacheTag("catalog-published-events")
  invalidateCacheTag("catalog-featured-events")
  invalidateCacheTag("catalog-event-categories")
}
