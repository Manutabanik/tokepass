import { revalidatePath, revalidateTag } from "next/cache"

import { publicEventSlugsForRevalidate } from "@/lib/events/public-event-slugs"

/**
 * Limpia ISR + Data Cache del evento en admin y en la vitrina pública.
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

  revalidatePath("/")
  revalidatePath("/eventos")
  revalidatePath("/events")
  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/events/preview/${eventId}`)

  for (const slug of slugs) {
    revalidatePath(`/eventos/${slug}`)
    revalidatePath(`/eventos/${slug}/entradas`)
    revalidatePath(`/e/${slug}`)
    revalidateTag(`event-${slug}`, "max")
    revalidateTag(`event-gate-${slug}`, "max")
  }

  revalidateTag(`event-${eventId}`, "max")
  revalidateTag(`related-${eventId}`, "max")
  revalidateTag("catalog-events", "max")
  revalidateTag("catalog-published-events", "max")
  revalidateTag("catalog-featured-events", "max")
}

