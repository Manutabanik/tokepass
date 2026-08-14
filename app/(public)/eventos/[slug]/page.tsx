import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  getEventAccessGate,
  getEventDetails,
  getRelatedEvents,
} from "@/app/actions/public-events"
import { getActiveResaleListingsForEvent } from "@/app/actions/resale"
import { canUserSandboxCheckout } from "@/app/actions/checkout"
import { EventSchemaScript } from "@/components/public/event-schema-script"
import { EventStorefront } from "@/components/public/event-storefront"
import { EventUnavailableNotice } from "@/components/public/event-unavailable-notice"
import { RelatedEventsSection } from "@/components/public/related-events-section"
import {
  buildEventMetadata,
  eventSeoFromDetails,
} from "@/lib/seo/event-metadata"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const event = await getEventDetails(slug)

  if (!event) {
    return { title: "Evento no encontrado" }
  }

  return buildEventMetadata(eventSeoFromDetails(event))
}

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { slug } = await params
  const { ref: referralCode } = await searchParams
  const [event, supabase] = await Promise.all([
    getEventDetails(slug).catch(() => null),
    createClient(),
  ])

  if (!event) {
    const gate = await getEventAccessGate(slug)
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
    ? await canUserSandboxCheckout(event.id)
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

  const locationText = event.venue?.location ?? event.location ?? ""
  const province = locationText.split(",")[0]?.trim() ?? ""

  const [resaleListings, relatedEvents] = await Promise.all([
    getActiveResaleListingsForEvent(event.id).catch(() => []),
    getRelatedEvents({
      currentEventId: event.id,
      category: event.categoryId,
      province,
      limit: 4,
    }).catch(() => []),
  ])

  const seo = eventSeoFromDetails(event)

  return (
    <div className="overflow-x-clip lg:overflow-x-visible">
      <EventSchemaScript {...seo} />
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
