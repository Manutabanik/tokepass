import { notFound } from "next/navigation"

import { EventV2Form } from "./event-v2-form"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

function pickGeneralTier(
  tiers: Array<{
    id: string
    name: string
    price: number
    capacity: number
    tier_type: string | null
  }>,
) {
  return (
    tiers.find((tier) => tier.tier_type === "general") ??
    tiers.find(
      (tier) => tier.tier_type !== "addon" && tier.tier_type !== "bundle",
    ) ??
    tiers[0] ??
    null
  )
}

export default async function EditEventV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const eventRead = await supabase
    .from("events")
    .select("id, title")
    .eq("id", id)
    .maybeSingle()

  const tierRead = await supabase
    .from("ticket_tiers")
    .select("id, name, price, capacity, tier_type")
    .eq("event_id", id)

  if (eventRead.error || !eventRead.data) {
    if (!eventRead.data && !eventRead.error) notFound()
    return (
      <main className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Event Editor V2</h1>
        <pre className="overflow-auto whitespace-pre-wrap rounded border-4 border-red-600 bg-red-50 p-4 text-sm text-red-900">
          {JSON.stringify(
            {
              error: eventRead.error?.message ?? "Evento no encontrado",
              details: eventRead.error?.details ?? null,
              code: eventRead.error?.code ?? "NOT_FOUND",
              step: "events.select",
            },
            null,
            2,
          )}
        </pre>
      </main>
    )
  }

  if (tierRead.error) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Event Editor V2</h1>
        <pre className="overflow-auto whitespace-pre-wrap rounded border-4 border-red-600 bg-red-50 p-4 text-sm text-red-900">
          {JSON.stringify(
            {
              error: tierRead.error.message,
              details: tierRead.error.details,
              code: tierRead.error.code,
              step: "ticket_tiers.select",
            },
            null,
            2,
          )}
        </pre>
      </main>
    )
  }

  const general = pickGeneralTier(tierRead.data ?? [])

  return (
    <main className="p-6">
      <h1 className="mb-2 text-xl font-semibold">Event Editor V2</h1>
      <p className="mb-6 max-w-xl text-sm text-zinc-600">
        Ruta aislada. No usa el wizard. Guardar escribe{" "}
        <code>events</code> y hace upsert de <code>ticket_tiers</code>. La
        respuesta cruda de Supabase aparece abajo en rojo.
      </p>
      {tierRead.data && !general ? (
        <p className="mb-4 text-sm text-amber-800">
          Este evento no tiene ticket_tiers. El guardado intentará insertar
          una entrada General.
        </p>
      ) : null}
      <EventV2Form
        eventId={eventRead.data.id}
        title={eventRead.data.title ?? ""}
        ticketId={general?.id ?? ""}
        ticketName={general?.name ?? "General"}
        price={Number(general?.price ?? 0)}
        stock={Number(general?.capacity ?? 0)}
      />
    </main>
  )
}
