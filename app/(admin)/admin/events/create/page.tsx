import type { Metadata } from "next"
import { ArrowLeft, Sparkles } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getOrganizerLabel } from "@/app/actions/superadmin"
import { EventCreationWizard } from "@/components/admin/event-creation-wizard"
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

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={impersonation ? "/superadmin" : "/admin/events"}
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {impersonation ? "Volver a Platform OS" : "Volver a Mis Eventos"}
      </Link>

      {impersonation && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-amber-100"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Modo Dios: Creando evento a nombre de {impersonation.name}
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              White-glove service. El evento quedará bajo el organizador
              seleccionado, no bajo tu cuenta.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <p className="text-sm font-medium text-violet-400">Event Builder</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
          Diseña una experiencia inolvidable
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Configura la operación completa en cuatro pasos. Podrás guardar el
          evento como borrador antes de publicarlo.
        </p>
      </div>

      <EventCreationWizard targetOrganizerId={impersonation?.id ?? null} />
    </div>
  )
}
