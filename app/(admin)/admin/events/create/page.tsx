import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getActiveEventCategories } from "@/app/actions/categories"
import { getOrganizerLabel } from "@/app/actions/superadmin"
import { listOrganizerVenues } from "@/app/actions/venues"
import { EventCreationWizard } from "@/components/admin/event-creation-wizard"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  DEFAULT_PLATFORM_FIXED_FEE,
} from "@/lib/pricing/event-fees"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Crear evento",
}

export default async function CreateEventPage({
  searchParams,
}: {
  searchParams: Promise<{ organizerId?: string }>
}) {
  const { organizerId: rawOrganizerId } = await searchParams
  const requestedOrganizerId = rawOrganizerId?.trim() || null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login-organizador?next=/admin/events/create")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  let impersonation: { id: string; name: string } | null = null

  if (requestedOrganizerId && isSuperAdmin) {
    try {
      const label = await getOrganizerLabel(requestedOrganizerId)
      if (label) {
        impersonation = { id: label.id, name: label.name }
      }
    } catch {
      impersonation = null
    }
  }

  const venues = await listOrganizerVenues(
    impersonation ? { organizerId: impersonation.id } : {},
  ).catch(() => [])
  const categories = await getActiveEventCategories().catch(() => [])
  const organizerServiceRate = DEFAULT_PLATFORM_FEE_PERCENTAGE / 100

  return (
    <EventCreationWizard
      organizerServiceRate={organizerServiceRate}
      platformFixedFee={DEFAULT_PLATFORM_FIXED_FEE}
      targetOrganizerId={impersonation?.id ?? null}
      impersonationName={impersonation?.name ?? null}
      venues={venues}
      categories={categories}
      backHref={impersonation ? "/superadmin" : "/admin/events"}
      backLabel={impersonation ? "Volver al Panel" : "Volver al Panel"}
    />
  )
}
