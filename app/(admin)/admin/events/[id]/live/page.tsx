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
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Link
          href={`/admin/events/${id}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver a operación del evento
        </Link>

        <header>
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
            <Activity className="size-3.5" aria-hidden />
            Command Center
          </p>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Monitor en vivo
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {snapshot.data.eventTitle} · Ingresos y aforo sin recargar
          </p>
        </header>

        <LiveOpsDashboard eventId={id} initial={snapshot.data} />
      </div>
    </main>
  )
}
