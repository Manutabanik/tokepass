import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { canUserSandboxCheckout } from "@/app/actions/checkout"
import { getPreviewEventDetails } from "@/app/actions/public-events"
import { EventPreviewBanner } from "@/components/public/event-preview-banner"
import { EventStorefront } from "@/components/public/event-storefront"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const event = await getPreviewEventDetails(id)
  if (!event) {
    return { title: "Vista previa no disponible" }
  }
  return {
    title: `Preview · ${event.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function EventPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=${encodeURIComponent(`/events/preview/${id}`)}`)
  }

  const event = await getPreviewEventDetails(id)
  if (!event) {
    notFound()
  }

  const [{ data: profile }, sandboxEligible] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, dni, email, phone")
      .eq("id", user.id)
      .maybeSingle(),
    canUserSandboxCheckout(id),
  ])

  return (
    <div>
      <EventPreviewBanner
        eventId={event.id}
        canPublish={event.status === "draft"}
        status={event.status}
      />
      <EventStorefront
        event={event}
        currentUserId={user.id}
        showBackLink={false}
        initialBuyer={{
          buyerName: profile?.full_name ?? "",
          buyerDni: profile?.dni ?? "",
          buyerEmail: profile?.email ?? user.email ?? "",
          buyerPhone: profile?.phone ?? "",
        }}
        sandboxEligible={sandboxEligible}
      />
    </div>
  )
}
