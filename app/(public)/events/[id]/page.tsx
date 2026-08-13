import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getEventItems } from "@/app/actions/addons"
import { getEventDetails } from "@/app/actions/public-events"
import { getActiveResaleListingsForEvent } from "@/app/actions/resale"
import { EventStorefront } from "@/components/public/event-storefront"
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
    getEventDetails(id),
    createClient(),
  ])

  if (!event) {
    notFound()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let initialBuyer: {
    buyerName?: string
    buyerDni?: string
    buyerEmail?: string
  } | null = null

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, dni, email")
      .eq("id", user.id)
      .maybeSingle()

    initialBuyer = {
      buyerName: profile?.full_name ?? "",
      buyerDni: profile?.dni ?? "",
      buyerEmail: profile?.email ?? user.email ?? "",
    }
  }

  let barItems: Awaited<ReturnType<typeof getEventItems>> = []
  try {
    barItems = await getEventItems(event.id)
  } catch {
    barItems = []
  }

  const resaleListings = await getActiveResaleListingsForEvent(event.id)

  return (
    <EventStorefront
      event={event}
      currentUserId={user?.id ?? null}
      referralCode={referralCode ?? null}
      initialBuyer={initialBuyer}
      barItems={barItems}
      resaleListings={resaleListings}
    />
  )
}
