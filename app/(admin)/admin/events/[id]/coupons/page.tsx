import { ArrowLeft, TicketPercent } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { listEventPromoCodes } from "@/app/actions/coupons"
import { EventCouponsManager } from "@/components/admin/event-coupons-manager"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Cupones y descuentos",
  description: "Creá y gestioná códigos promocionales del evento.",
}

export default async function EventCouponsPage({
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
    redirect(`/login-organizador?next=/admin/events/${id}/coupons`)
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, organizer_id")
    .eq("id", id)
    .maybeSingle()

  if (!event) notFound()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    redirect("/admin/events")
  }

  const coupons = await listEventPromoCodes(id)

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a operación del evento
      </Link>

      <header>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          <TicketPercent className="size-3.5" aria-hidden />
          Promociones
        </p>
        <h1 className="text-3xl font-black tracking-tight text-foreground">
          Cupones y descuentos
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Códigos % o monto fijo. El total se recalcula de forma segura en el
          checkout.
        </p>
      </header>

      <EventCouponsManager
        eventId={id}
        eventTitle={event.title}
        initialCoupons={coupons}
      />
    </main>
  )
}
