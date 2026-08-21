import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getEventPurchaseLimits } from "@/app/actions/event-purchase-limits"
import { EventPurchaseLimitsForm } from "@/components/admin/event-purchase-limits-form"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Ajustes de compra",
  robots: { index: false, follow: false },
}

export default async function EventPurchaseSettingsPage({
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
    redirect(`/login-organizador?next=/admin/events/${id}/settings`)
  }

  const settings = await getEventPurchaseLimits(id)
  if (!settings) {
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", id)
      .maybeSingle()
    if (!event) notFound()
    redirect("/admin/events")
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a operación del evento
      </Link>

      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">
          Ajustes de compra
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {settings.eventTitle} · tope por defecto si una tarifa no define su
          máximo.
        </p>
      </header>

      <EventPurchaseLimitsForm initial={settings} />
    </main>
  )
}
