import { ArrowLeft, ShoppingBag } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { CreateStoreItemForm } from "@/components/admin/create-store-item-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCurrency } from "@/lib/format"
import {
  EVENT_ITEM_CATEGORY_ICONS,
  EVENT_ITEM_CATEGORY_LABELS,
  parseEventItemCategory,
} from "@/lib/store-categories"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Tienda de Extras",
}

export default async function EventStorePage({
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
    redirect(`/login-organizador?next=/admin/events/${eventId}/store`)
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
    .select(
      "id, name, description, price, stock, is_active, image_url, category, created_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href={`/admin/events/${eventId}`}
          className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-400 transition hover:text-zinc-900 dark:hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Volver al centro de mando
        </Link>

        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">
            <ShoppingBag className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-violet-400">
              Tienda de Extras
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.035em] text-zinc-900 dark:text-white">
              {event.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
              Vendé merch, comida, bebidas o servicios. Cada unidad genera un QR
              de canje independiente. Canjealos en el{" "}
              <Link
                href="/admin/store-scanner"
                className="text-violet-300 underline"
              >
                Escáner de Tienda
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <Card className="border-zinc-200 bg-zinc-50 dark:border-white/8 dark:bg-zinc-950/40">
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
          <CardDescription>
            El comprador lo ve en la billetera o post-compra, no en el checkout
            de entradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateStoreItemForm eventId={eventId} />
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-zinc-50 dark:border-white/8 dark:bg-zinc-950/40">
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            {(items ?? []).length} producto
            {(items ?? []).length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(items ?? []).length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Todavía no hay productos en la tienda de este evento.
            </p>
          ) : (
            (items ?? []).map((item) => {
              const category = parseEventItemCategory(item.category)
              const Icon = EVENT_ITEM_CATEGORY_ICONS[category]
              return (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex min-w-0 gap-3">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-slate-600 dark:text-zinc-400">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900 dark:text-white">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">
                        {EVENT_ITEM_CATEGORY_LABELS[category]}
                        {item.description ? ` · ${item.description}` : null}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Stock {item.stock}
                        {!item.is_active ? " · inactivo" : null}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 font-bold tabular-nums text-zinc-900 dark:text-white">
                    {formatCurrency(Number(item.price))}
                  </p>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
