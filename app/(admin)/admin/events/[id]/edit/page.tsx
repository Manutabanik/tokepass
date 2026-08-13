import { ArrowLeft, Pencil } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventForEditing } from "@/app/actions/events"
import { listOrganizerVenues } from "@/app/actions/venues"
import { EventCreationWizard } from "@/components/admin/event-creation-wizard"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  DEFAULT_PLATFORM_FIXED_FEE,
  eventFeeRate,
  eventFixedFee,
} from "@/lib/pricing/event-fees"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Editar evento",
  description: "Actualizá la experiencia, el lugar y sus entradas.",
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

  let initialData: Awaited<ReturnType<typeof getEventForEditing>> = null
  let venues: Awaited<ReturnType<typeof listOrganizerVenues>> = []
  let feeRow: {
    platform_fee_percentage: number | null
    platform_fixed_fee: number | null
    is_sponsored_by_tokepass: boolean | null
  } | null = null

  try {
    const [eventData, venueList, eventFees] = await Promise.all([
      getEventForEditing(id),
      listOrganizerVenues().catch(() => []),
      supabase
        .from("events")
        .select(
          "platform_fee_percentage, platform_fixed_fee, is_sponsored_by_tokepass",
        )
        .eq("id", id)
        .maybeSingle(),
    ])
    initialData = eventData
    venues = venueList
    feeRow = eventFees.data
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
    isSponsoredByTokepass: Boolean(feeRow?.is_sponsored_by_tokepass),
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/admin/events"
        className="inline-flex w-fit items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Mis eventos
      </Link>

      <header>
        <p className="mb-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">
          <Pencil className="size-3.5" aria-hidden="true" />
          Event Editor
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Editar experiencia: {initialData.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-base">
          Actualizá la identidad, el lugar y la estrategia de entradas. Los
          cambios se aplican de forma atómica sin alterar órdenes históricas.
        </p>
      </header>

      <EventCreationWizard
        initialData={initialData}
        organizerServiceRate={eventFeeRate(feeConfig)}
        platformFixedFee={eventFixedFee(feeConfig)}
        venues={venues}
      />
    </main>
  )
}
