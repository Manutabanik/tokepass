import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Gift,
  ImageIcon,
  Megaphone,
  Pencil,
  QrCode,
  Share2,
  ShoppingBag,
  Ticket,
  TicketPercent,
  Package,
  Users,
  Wallet,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { EventCommandHeader } from "@/components/admin/event-command-header"
import { SponsorshipRequestBanner } from "@/components/admin/sponsorship-request-banner"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency, formatEventDate, formatNumber } from "@/lib/format"

export const metadata: Metadata = {
  title: "Centro de mando del evento",
}

const actionClass =
  "group rounded-2xl border border-border bg-card p-5 transition hover:border-border hover:bg-muted/50"

const dressCardClass =
  "group flex h-full flex-col rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 p-5 transition hover:border-emerald-500/40 hover:shadow-[0_12px_40px_rgba(16,185,129,0.08)] dark:hover:border-emerald-500/35"

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
    .select("capacity, sold, price")
    .eq("event_id", id)

  const capacity = (tiers ?? []).reduce(
    (sum, tier) => sum + Number(tier.capacity),
    0,
  )
  const sold = (tiers ?? []).reduce(
    (sum, tier) => sum + Number(tier.sold),
    0,
  )
  const recaudacion = (tiers ?? []).reduce(
    (sum, tier) => sum + Number(tier.sold) * Number(tier.price),
    0,
  )

  const dressCards = [
    {
      href: `/admin/events/${id}/multimedia`,
      title: "Fotos y Videos",
      description:
        "Agregá un link de YouTube o una galería de fotos para que tu evento se vea increíble.",
      icon: ImageIcon,
      accent: "text-violet-500 dark:text-violet-300",
      iconWrap: "bg-violet-500/10",
    },
    {
      href: `/admin/events/${id}/store`,
      title: "Tienda de Extras",
      description:
        "Vendé merch, comida, bebidas o servicios. Cada unidad tiene QR de canje propio.",
      icon: ShoppingBag,
      accent: "text-emerald-600 dark:text-emerald-200",
      iconWrap: "bg-emerald-500/10",
    },
    {
      href: `/admin/events/${id}/multimedia#flyer-historias`,
      title: "Flyer para Historias",
      description:
        "Subí la imagen vertical que tus compradores van a compartir en Instagram al comprar su entrada.",
      icon: Share2,
      accent: "text-fuchsia-600 dark:text-fuchsia-300",
      iconWrap: "bg-fuchsia-500/10",
    },
  ] as const

  const actions = [
    {
      href: `/admin/events/${id}/edit`,
      label: "Editar Datos",
      description: "Título, fecha, flyer, lugar y tipos de entrada.",
      icon: Pencil,
    },
    {
      href: `/admin/events/${id}/tickets`,
      label: "Lista de Compradores",
      description: "Buscá compradores, reenviá entradas y resolvé reclamos.",
      icon: Ticket,
    },
    {
      href: `/admin/events/${id}/lists`,
      label: "Listas digitales",
      description: "Cupos, invitados y control de ingreso.",
      icon: ClipboardList,
    },
    {
      href: `/admin/events/${id}/complimentary`,
      label: "Emitir cortesías",
      description: "CSV nominado, lote innombrado, mesas y combos.",
      icon: Gift,
    },
    {
      href: `/admin/events/${id}/tiers`,
      label: "Combos y tarifas",
      description: "Packs, abonos, kits y tarifas especiales.",
      icon: Package,
    },
    {
      href: `/admin/events/${id}/marketing`,
      label: "Marketing y anuncios",
      description: "Conectá Meta, TikTok y Google para medir ventas.",
      icon: Megaphone,
    },
    {
      href: `/admin/events/${id}/coupons`,
      label: "Cupones y descuentos",
      description: "Códigos promocionales con porcentaje o monto fijo.",
      icon: TicketPercent,
    },
    {
      href: `/admin/events/${id}/live`,
      label: "Monitor en vivo",
      description: "Aforo e ingresos en tiempo real el día del evento.",
      icon: Activity,
    },
    {
      href: "/admin/scanner",
      label: "Control de Puerta",
      description:
        "Escaneá los códigos QR o buscá al comprador por nombre si se quedó sin batería.",
      icon: QrCode,
    },
  ]

  const showSponsorshipCta =
    event.organizer_id === user.id && !event.is_sponsored_by_tokepass

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Mis Eventos
      </Link>

      <EventCommandHeader
        eventId={event.id}
        title={event.title}
        subtitle={`${formatEventDate(event.date)} · ${event.location}`}
        status={event.status}
        isSponsored={Boolean(event.is_sponsored_by_tokepass)}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <Ticket className="size-5 text-emerald-600 dark:text-emerald-200" aria-hidden="true" />
          <p className="mt-4 text-3xl font-black text-foreground">
            {formatNumber(sold)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Entradas Vendidas</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <Wallet className="size-5 text-sky-500 dark:text-sky-300" aria-hidden="true" />
          <p className="mt-4 text-3xl font-black text-foreground">
            {formatCurrency(recaudacion)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Recaudación</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <Users className="size-5 text-violet-500 dark:text-violet-300" aria-hidden="true" />
          <p className="mt-4 text-3xl font-black text-foreground">
            {formatNumber(Math.max(0, capacity - sold))}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Vestí tu evento
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Completá multimedia, barra y el flyer de historias antes de
            publicar.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {dressCards.map(
            ({ href, title, description, icon: Icon, accent, iconWrap }) => (
              <Link key={href} href={href} className={dressCardClass}>
                <span
                  className={`grid size-11 place-items-center rounded-xl ${iconWrap} ${accent}`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-bold text-foreground">
                  {title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 transition group-hover:gap-2 dark:text-emerald-200">
                  Configurar
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            ),
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-foreground">
          Operación del evento
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Accesos a compradores, puerta, cupones y el resto del día a día.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {actions.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className={actionClass}>
              <Icon
                className="size-5 text-muted-foreground transition group-hover:text-emerald-600 dark:group-hover:text-emerald-800 dark:text-emerald-200"
                aria-hidden="true"
              />
              <h3 className="mt-4 font-bold text-foreground">
                {label}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
