import type { Metadata } from "next"
import { ArrowLeft, Sparkles } from "lucide-react"
import Link from "next/link"
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
      <Link
        href={impersonation ? "/superadmin" : "/admin/events"}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {impersonation ? "Volver al Panel de Control" : "Volver a Mis Eventos"}
      </Link>

      {impersonation && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-amber-100"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Estás creando un evento a nombre de {impersonation.name}
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              El evento queda bajo esa productora, no bajo tu cuenta.
            </p>
          </div>
        </div>
      )}

      <header>
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
          Nuevo Evento
        </p>
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Creá tu evento
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Completá los datos en tres pasos. Guardá el borrador y potenciale
          barra, galería y difusión desde el panel del evento.
        </p>
      </header>

      <EventCreationWizard
        organizerServiceRate={organizerServiceRate}
        platformFixedFee={DEFAULT_PLATFORM_FIXED_FEE}
        targetOrganizerId={impersonation?.id ?? null}
        venues={venues}
        categories={categories}
      />
    </div>
  )
}
