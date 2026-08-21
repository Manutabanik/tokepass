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
  description:
    "Emisión individual con envío por email o WhatsApp, o lotes masivos por CSV.",
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

  if (tiers[0]) {
    await getTierComboItems(tiers[0].id)
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/admin/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al centro de mando
      </Link>

      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-500">
          Cortesías
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-foreground">
          <Gift className="size-8 text-amber-600 dark:text-amber-500" />
          Emitir cortesías
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {event.title} · Envío 1 a 1 o lotes masivos. Hasta 3.000 QRs por tanda.
        </p>
      </header>

      <ComplimentaryIssuer
        eventId={eventId}
        tiers={tiers}
        storeItems={storeItems.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          stock: Number(item.stock),
        }))}
      />
    </main>
  )
}
