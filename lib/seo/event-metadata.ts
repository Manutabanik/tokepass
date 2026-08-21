import type { Metadata } from "next"

import { formatEventDay } from "@/lib/format"
import { publicEventUrl, toArgentinaIso8601 } from "@/lib/seo/site"

export type EventSeoPerformer = {
  name: string
  imageUrl?: string | null
}

export type EventSeoOrganizer = {
  name: string
  bio?: string | null
  imageUrl?: string | null
}

export type EventSeoInput = {
  id: string
  slug?: string | null
  title: string
  description: string | null
  date: string
  endsAt: string | null
  createdAt?: string | null
  location: string | null
  imageUrl: string | null
  socialShareImageUrl?: string | null
  venueName: string | null
  venueLocation: string | null
  venueCity: string | null
  venueAddress: string | null
  venueRegion: string | null
  cityHint?: string | null
  status?: string | null
  ticketsLeft?: number | null
  prices: number[]
  organizer?: EventSeoOrganizer | null
  performers?: EventSeoPerformer[]
}

function venueLine(event: EventSeoInput): string {
  const parts = [
    event.venueName,
    event.venueCity || event.cityHint,
    event.venueLocation || event.location,
  ].filter((part, index, all) => {
    if (!part?.trim()) return false
    return all.findIndex((item) => item?.trim() === part.trim()) === index
  })
  return parts.join(", ")
}

function locality(event: EventSeoInput): string {
  if (event.venueCity?.trim()) return event.venueCity.trim()
  if (event.cityHint?.trim()) return event.cityHint.trim()
  const fromLocation = (event.venueLocation || event.location || "")
    .split(",")[0]
    ?.trim()
  return fromLocation || "Argentina"
}

function region(event: EventSeoInput): string {
  if (event.venueRegion?.trim()) return event.venueRegion.trim()
  const bits = (event.venueLocation || event.location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (bits.length >= 2) return bits[1] ?? "AR"
  return "AR"
}

/** WhatsApp/Meta: crop 1.91:1 si existe; si no, flyer. */
export function resolveEventShareImage(event: {
  socialShareImageUrl?: string | null
  imageUrl?: string | null
}): string | null {
  const share = event.socialShareImageUrl?.trim()
  if (share) return share
  return event.imageUrl?.trim() || null
}

export function isSeoHiddenEventStatus(status?: string | null): boolean {
  return status === "paused" || status === "cancelled"
}

export function buildNoindexEventMetadata(title: string): Metadata {
  const safeTitle = title.trim() || "Evento"
  return {
    title: safeTitle,
    robots: { index: false, follow: false },
    openGraph: { title: safeTitle },
    twitter: { title: safeTitle },
  }
}

export function buildEventMetadata(event: EventSeoInput): Metadata {
  const canonical = publicEventUrl(event)
  const place = venueLine(event)
  const dateLabel = formatEventDay(event.date)
  const description =
    `Conseguí tus entradas para ${event.title} en ${place}. Fecha: ${dateLabel}. Compra directa y segura sin filas en TokePass.`
  const title = `${event.title} - Entradas Oficiales | TokePass`
  const keywords = [
    event.title,
    "entradas",
    "boletos",
    locality(event),
    "TokePass",
  ].filter((item, index, all) => all.indexOf(item) === index)
  const shareImage = resolveEventShareImage(event)
  const images = shareImage
    ? [
        {
          url: shareImage,
          width: 1200,
          height: 630,
          alt: event.title,
        },
      ]
    : undefined

  return {
    title: { absolute: title },
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "TokePass",
      locale: "es_AR",
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: shareImage ? [shareImage] : undefined,
    },
  }
}

function buildOrganizerJsonLd(
  organizer?: EventSeoOrganizer | null,
): Record<string, unknown> | undefined {
  if (!organizer) return undefined
  const name = organizer.name.trim()
  if (!name) return undefined
  return {
    "@type": "Organization",
    name,
    description: organizer.bio?.trim() || undefined,
    image: organizer.imageUrl?.trim() || undefined,
  }
}

function buildPerformerJsonLd(
  performers?: EventSeoPerformer[],
): Record<string, unknown> | Array<Record<string, unknown>> | undefined {
  const items = (performers ?? [])
    .map((artist) => {
      const name = artist.name?.trim()
      if (!name) return null
      return {
        "@type": "PerformingGroup",
        name,
        image: artist.imageUrl?.trim() || undefined,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)

  if (items.length === 0) return undefined
  return items.length === 1 ? items[0] : items
}

export function buildEventJsonLd(event: EventSeoInput): Record<string, unknown> {
  const url = publicEventUrl(event)
  const paidPrices = event.prices.filter((price) => Number.isFinite(price))
  const lowPrice = paidPrices.length ? Math.min(...paidPrices) : 0
  const highPrice = paidPrices.length ? Math.max(...paidPrices) : 0
  const soldOut = event.ticketsLeft != null && event.ticketsLeft <= 0
  const cancelled = event.status === "cancelled"
  const startDate = toArgentinaIso8601(event.date)
  const endDate = toArgentinaIso8601(event.endsAt || event.date)
  const validFrom = toArgentinaIso8601(event.createdAt || event.date)
  const organizer = buildOrganizerJsonLd(event.organizer)
  const performer = buildPerformerJsonLd(event.performers)

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate,
    endDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venueName || event.location,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venueAddress || undefined,
        addressLocality: locality(event),
        addressRegion: region(event),
        addressCountry: "AR",
      },
    },
    image: event.imageUrl || undefined,
    description:
      event.description?.trim() ||
      `Entradas oficiales para ${event.title} en TokePass.`,
    organizer,
    performer,
    offers: {
      "@type": "AggregateOffer",
      url,
      priceCurrency: "ARS",
      lowPrice,
      highPrice,
      availability: soldOut
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      validFrom,
      seller: {
        "@type": "Organization",
        name: "TokePass",
      },
    },
  }
}

export function eventSeoFromDetails(event: {
  id: string
  slug?: string | null
  title: string
  description: string | null
  date: string
  endsAt: string | null
  createdAt?: string | null
  location: string | null
  imageUrl: string | null
  socialShareImageUrl?: string | null
  status?: string | null
  organizerName?: string | null
  organizerBio?: string | null
  organizerAvatarUrl?: string | null
  lineup?: { artists?: EventSeoPerformer[] } | null
  venue?: {
    name: string
    location: string
    city?: string | null
    address?: string | null
  } | null
  tiers: Array<{ price: number; available?: number }>
}): EventSeoInput {
  const locationText = event.venue?.location ?? event.location ?? ""
  const bits = locationText
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  const organizerName = event.organizerName?.trim() || null

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    date: event.date,
    endsAt: event.endsAt,
    createdAt: event.createdAt,
    location: event.location,
    imageUrl: event.imageUrl,
    socialShareImageUrl: event.socialShareImageUrl?.trim() || null,
    venueName: event.venue?.name ?? null,
    venueLocation: event.venue?.location ?? null,
    venueCity: event.venue?.city ?? null,
    venueAddress: event.venue?.address ?? null,
    venueRegion: bits[1] ?? null,
    cityHint: bits[0] ?? null,
    status: event.status,
    ticketsLeft: event.tiers.reduce(
      (sum, tier) => sum + Math.max(0, tier.available ?? 0),
      0,
    ),
    prices: event.tiers.map((tier) => Number(tier.price)),
    organizer: organizerName
      ? {
          name: organizerName,
          bio: event.organizerBio?.trim() || null,
          imageUrl: event.organizerAvatarUrl?.trim() || null,
        }
      : null,
    performers: (event.lineup?.artists ?? [])
      .map((artist) => ({
        name: artist.name?.trim() ?? "",
        imageUrl: artist.imageUrl?.trim() || null,
      }))
      .filter((artist) => artist.name.length > 0),
  }
}
