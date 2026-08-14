import { Activity, ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getLiveOpsSnapshot } from "@/app/actions/live-ops"
import { LiveOpsDashboard } from "@/components/admin/live-ops-dashboard"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Monitor en vivo",
  description: "Aforo e ingresos en tiempo real el día del evento.",
}

export default async function EventLiveOpsPage({
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
    redirect(`/login-organizador?next=/admin/events/${id}/live`)
  }

  const snapshot = await getLiveOpsSnapshot(id)
  if (!snapshot.ok) {
    if (snapshot.error.includes("permiso")) redirect("/admin/events")
    notFound()
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Link
          href={`/admin/events/${id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver a operación del evento
        </Link>

        <header>
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
            <Activity className="size-3.5" aria-hidden />
            Command Center
          </p>
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Monitor en Vivo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {snapshot.data.eventTitle} · Aforo, ritmo de acceso y picos de puerta en tiempo real
          </p>
        </header>

        <LiveOpsDashboard eventId={id} initial={snapshot.data} />
      </div>
    </main>
  )
}
