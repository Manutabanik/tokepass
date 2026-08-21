import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { getActiveEventCategories } from "@/app/actions/categories"
import { getEventForEditing } from "@/app/actions/events"
import { getOrganizerLabel } from "@/app/actions/superadmin"
import { listOrganizerVenues } from "@/app/actions/venues"
import { EventCreationWizard } from "@/components/admin/event-creation-wizard"
import { parseEditWorkspaceStep } from "@/lib/events/wizard-steps"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  DEFAULT_PLATFORM_FIXED_FEE,
  eventFeeRate,
  eventFixedFee,
} from "@/lib/pricing/event-fees"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Editar evento",
  description: "Información, mapa y tarifas del evento.",
}

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { id } = await params
  const { step: stepParam } = await searchParams
  const initialStep = parseEditWorkspaceStep(stepParam)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/admin/events/${id}/edit`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuperAdmin = profile?.role === "super_admin"

  let initialData: Awaited<ReturnType<typeof getEventForEditing>> = null
  let venues: Awaited<ReturnType<typeof listOrganizerVenues>> = []
  let categories: Awaited<ReturnType<typeof getActiveEventCategories>> = []
  let feeRow: {
    platform_fee_percentage: number | null
    platform_fixed_fee: number | null
    is_sponsored_by_tokepass: boolean | null
  } | null = null
  let impersonation: { id: string; name: string } | null = null

  try {
    const feeClient = isSuperAdmin ? createAdminClient() : supabase
    const [eventData, categoryList, eventFees] = await Promise.all([
      getEventForEditing(id),
      getActiveEventCategories().catch(() => []),
      feeClient
        .from("events")
        .select(
          "platform_fee_percentage, platform_fixed_fee, is_sponsored_by_tokepass",
        )
        .eq("id", id)
        .maybeSingle(),
    ])
    initialData = eventData
    categories = categoryList
    feeRow = eventFees.data

    if (initialData) {
      venues = await listOrganizerVenues({
        includeArchived: true,
        includeIds: initialData.values.venue.existingVenueId
          ? [initialData.values.venue.existingVenueId]
          : [],
        organizerId: initialData.organizerId,
      }).catch(() => [])
    }

    if (
      isSuperAdmin &&
      initialData &&
      initialData.organizerId !== user.id
    ) {
      try {
        const label = await getOrganizerLabel(initialData.organizerId)
        if (label) impersonation = { id: label.id, name: label.name }
      } catch {
        impersonation = {
          id: initialData.organizerId,
          name: "otra productora",
        }
      }
    }
  } catch (error) {
    console.error("[EditEventPage]", id, error)
    notFound()
  }

  if (!initialData) notFound()

  const feeConfig = {
    platformFeePercentage: Number(
      feeRow?.platform_fee_percentage ?? DEFAULT_PLATFORM_FEE_PERCENTAGE,
    ),
    platformFixedFee: Number(
      feeRow?.platform_fixed_fee ?? DEFAULT_PLATFORM_FIXED_FEE,
    ),
    maxFreeTickets: 100,
    isSponsoredByTokePass: Boolean(feeRow?.is_sponsored_by_tokepass),
  }

  return (
    <EventCreationWizard
      workspace
      initialStep={initialStep}
      backHref={impersonation ? `/superadmin/events/${id}` : `/admin/events/${id}`}
      backLabel="Volver al Panel"
      initialData={initialData}
      organizerServiceRate={eventFeeRate(feeConfig)}
      platformFixedFee={eventFixedFee(feeConfig)}
      targetOrganizerId={impersonation?.id ?? null}
      impersonationName={impersonation?.name ?? null}
      venues={venues}
      categories={categories}
    />
  )
}
