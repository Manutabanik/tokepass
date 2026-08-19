import { ArrowLeft, Pencil, Sparkles } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getActiveEventCategories } from "@/app/actions/categories"
import { getEventForEditing } from "@/app/actions/events"
import { getOrganizerLabel } from "@/app/actions/superadmin"
import { listOrganizerVenues } from "@/app/actions/venues"
import { EventCreationWizard } from "@/components/admin/event-creation-wizard"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  DEFAULT_PLATFORM_FIXED_FEE,
  eventFeeRate,
  eventFixedFee,
} from "@/lib/pricing/event-fees"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Datos del Evento",
  description: "Actualizá el lugar y los tipos de entradas.",
}

export default async function EditEventPage({
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
      <Link
        href={impersonation ? `/superadmin/events/${id}` : "/admin/events"}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {impersonation ? "Volver al control del evento" : "Volver a Mis Eventos"}
      </Link>

      {impersonation ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-amber-100"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Asistencia delegada: configurás el evento de {impersonation.name}
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              Seguís con tu sesión de SuperAdmin. Los cambios quedan en esa
              productora.
            </p>
          </div>
        </div>
      ) : null}

      <header>
        <p className="mb-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
          <Pencil className="size-3.5" aria-hidden="true" />
          Datos del Evento
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Editá: {initialData.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Actualizá el título, el lugar y los tipos de entradas. Los cambios no
          afectan las compras que ya se hicieron.
        </p>
      </header>

      <EventCreationWizard
        initialData={initialData}
        organizerServiceRate={eventFeeRate(feeConfig)}
        platformFixedFee={eventFixedFee(feeConfig)}
        targetOrganizerId={impersonation?.id ?? null}
        venues={venues}
        categories={categories}
      />
    </main>
  )
}
