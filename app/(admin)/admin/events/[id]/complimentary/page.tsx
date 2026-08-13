import { ArrowLeft, Gift } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import {
  getComplimentaryTiers,
  getEventStoreItemsForCombo,
  getTierComboItems,
} from "@/app/actions/complimentary"
import { ComplimentaryIssuer } from "@/components/admin/complimentary-issuer"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Emitir cortesías",
  description: "Emisión masiva de cortesías por CSV o lote innombrado.",
}

export default async function EventComplimentaryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/admin/events/${eventId}/complimentary`)
  }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select("id, title, organizer_id")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) notFound()
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    redirect("/admin/events")
  }

  const [tiers, storeItems] = await Promise.all([
    getComplimentaryTiers(eventId),
    getEventStoreItemsForCombo(eventId),
  ])

  // Prefetch combo for first tier (client will refresh on change)
  if (tiers[0]) {
    await getTierComboItems(tiers[0].id)
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={`/admin/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Volver al centro de mando
      </Link>

      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-500">
          Cortesías
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          <Gift className="size-8 text-amber-500" />
          Emitir cortesías
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {event.title} · CSV nominado o lote para imprimir. Hasta 3.000 QRs por
          tanda.
        </p>
      </header>

      <ComplimentaryIssuer
        eventId={eventId}
        tiers={tiers}
        storeItems={storeItems.map((i) => ({
          id: i.id,
          name: i.name,
          price: Number(i.price),
          stock: Number(i.stock),
        }))}
      />
    </main>
  )
}
