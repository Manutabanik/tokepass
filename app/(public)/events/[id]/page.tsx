import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  getEventAccessGate,
  getEventDetails,
  getRelatedEvents,
} from "@/app/actions/public-events"
import { getActiveResaleListingsForEvent } from "@/app/actions/resale"
import { canUserSandboxCheckout } from "@/app/actions/checkout"
import { EventStorefront } from "@/components/public/event-storefront"
import { EventUnavailableNotice } from "@/components/public/event-unavailable-notice"
import { RelatedEventsSection } from "@/components/public/related-events-section"
import { createClient } from "@/lib/supabase/server"

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

  return {
    title: event.title,
    description:
      event.description?.slice(0, 160) ??
      `Comprá entradas para ${event.title} en Tokepass.`,
    openGraph: {
      title: event.title,
      description:
        event.description?.slice(0, 160) ??
        `Comprá entradas para ${event.title} en Tokepass.`,
      type: "website",
      images: event.imageUrl
        ? [{ url: event.imageUrl, alt: event.title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description:
        event.description?.slice(0, 160) ??
        `Comprá entradas para ${event.title} en Tokepass.`,
      images: event.imageUrl ? [event.imageUrl] : undefined,
    },
  }
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { id } = await params
  const { ref: referralCode } = await searchParams
  const [event, supabase] = await Promise.all([
    getEventDetails(id).catch(() => null),
    createClient(),
  ])

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const sandboxEligible = user
    ? await canUserSandboxCheckout(id)
    : false

  let initialBuyer: {
    buyerName?: string
    buyerDni?: string
    buyerEmail?: string
    buyerPhone?: string
  } | null = null

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, dni, email, phone")
      .eq("id", user.id)
      .maybeSingle()

    initialBuyer = {
      buyerName: profile?.full_name ?? "",
      buyerDni: profile?.dni ?? "",
      buyerEmail: profile?.email ?? user.email ?? "",
      buyerPhone: profile?.phone ?? "",
    }
  }

  const province = (
    event.venue?.location ?? event.location
  )
    .split(",")[0]
    ?.trim() ?? ""

  const [resaleListings, relatedEvents] = await Promise.all([
    getActiveResaleListingsForEvent(event.id),
    getRelatedEvents({
      currentEventId: event.id,
      category: event.categoryId,
      province,
      limit: 4,
    }),
  ])

  return (
    <div className="overflow-x-hidden">
      <EventStorefront
        event={event}
        currentUserId={user?.id ?? null}
        referralCode={referralCode ?? null}
        initialBuyer={initialBuyer}
        resaleListings={resaleListings}
        sandboxEligible={sandboxEligible}
      />
      <RelatedEventsSection events={relatedEvents} />
    </div>
  )
}
