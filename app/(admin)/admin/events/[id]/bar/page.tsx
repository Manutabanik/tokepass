import { ArrowLeft, GlassWater } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { CreateBarItemForm } from "@/components/admin/create-bar-item-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCurrency } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Productos de barra",
}

export default async function EventBarItemsPage({
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
    redirect(`/login-organizador?next=/admin/events/${eventId}/bar`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const { data: event } = await supabase
    .from("events")
    .select("id, title, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!event) notFound()

  if (profile?.role !== "super_admin" && event.organizer_id !== user.id) {
    redirect("/admin")
  }

  const { data: items } = await supabase
    .from("event_items")
    .select("id, name, description, price, stock, is_active, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/admin/events"
          className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Volver a eventos
        </Link>

        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
            <GlassWater className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-amber-400">Pre-venta barra</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.035em] text-white">
              {event.title}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Tragos, combos y merch. Se venden en checkout y se canjean en{" "}
              <Link href="/admin/bar-scanner" className="text-amber-300 underline">
                Escáner Barra
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <Card className="border-white/8 bg-zinc-950/40">
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
          <CardDescription>
            Cada unidad vendida genera un QR de barra independiente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateBarItemForm eventId={eventId} />
        </CardContent>
      </Card>

      <Card className="border-white/8 bg-zinc-950/40">
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            {(items ?? []).length} producto
            {(items ?? []).length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(items ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">
              Todavía no hay productos de barra para este evento.
            </p>
          ) : (
            (items ?? []).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-white">{item.name}</p>
                  {item.description ? (
                    <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-600">
                    Stock {item.stock}
                    {!item.is_active ? " · inactivo" : null}
                  </p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-white">
                  {formatCurrency(Number(item.price))}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
