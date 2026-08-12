import {
  ArrowLeft,
  ClipboardList,
  GlassWater,
  Pencil,
  QrCode,
  Ticket,
  Users,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { SponsorshipRequestBanner } from "@/components/admin/sponsorship-request-banner"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/server"
import { formatEventDate, formatNumber } from "@/lib/format"

export const metadata: Metadata = {
  title: "Gestionar evento",
}

const actionClass =
  "group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 transition hover:border-zinc-700 hover:bg-zinc-900"

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login-organizador?next=/admin/events/${id}`)

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select(
        "id, title, date, location, status, organizer_id, is_sponsored_by_tokepass",
      )
      .eq("id", id)
      .maybeSingle(),
  ])

  if (!event) notFound()
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    redirect("/admin/events")
  }

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("capacity, sold")
    .eq("event_id", id)

  const capacity = (tiers ?? []).reduce(
    (sum, tier) => sum + Number(tier.capacity),
    0,
  )
  const sold = (tiers ?? []).reduce(
    (sum, tier) => sum + Number(tier.sold),
    0,
  )

  const actions = [
    {
      href: `/admin/events/${id}/edit`,
      label: "Editar experiencia",
      description: "Título, fecha, flyer, lugar y entradas.",
      icon: Pencil,
    },
    {
      href: `/admin/events/${id}/tickets`,
      label: "Entradas emitidas",
      description: "Buscá clientes, reenviá tickets y resolvé reclamos.",
      icon: Ticket,
    },
    {
      href: `/admin/events/${id}/lists`,
      label: "Listas digitales",
      description: "Cupos, invitados y check-in.",
      icon: ClipboardList,
    },
    {
      href: `/admin/events/${id}/bar`,
      label: "Preventa de barra",
      description: "Productos, stock y consumiciones.",
      icon: GlassWater,
    },
    {
      href: "/admin/scanner",
      label: "Escáner de puerta",
      description: "Validá entradas y controlá accesos.",
      icon: QrCode,
    },
  ]

  const showSponsorshipCta =
    event.organizer_id === user.id && !event.is_sponsored_by_tokepass

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Mis eventos
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {event.title}
          </h1>
          <Badge
            variant="outline"
            className="rounded-full border-zinc-700 uppercase"
          >
            {event.status}
          </Badge>
          {event.is_sponsored_by_tokepass ? (
            <Badge className="rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-100">
              Auspiciado
            </Badge>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          {formatEventDate(event.date)} · {event.location}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
          <Ticket className="size-5 text-emerald-400" aria-hidden="true" />
          <p className="mt-4 text-3xl font-black text-white">
            {formatNumber(sold)}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Entradas reservadas/vendidas</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
          <Users className="size-5 text-violet-400" aria-hidden="true" />
          <p className="mt-4 text-3xl font-black text-white">
            {formatNumber(Math.max(0, capacity - sold))}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Disponibles de {formatNumber(capacity)}
          </p>
        </div>
      </section>

      {showSponsorshipCta ? (
        <SponsorshipRequestBanner
          eventId={event.id}
          eventTitle={event.title}
        />
      ) : null}

      <section>
        <h2 className="text-lg font-bold text-white">Operación del evento</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {actions.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className={actionClass}>
              <Icon
                className="size-5 text-zinc-400 transition group-hover:text-emerald-400"
                aria-hidden="true"
              />
              <h3 className="mt-4 font-bold text-white">{label}</h3>
              <p className="mt-1 text-sm text-zinc-500">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
