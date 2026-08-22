import {
  Bell,
  ChevronRight,
  Compass,
  Heart,
  Receipt,
  Ticket,
  UserRound,
} from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { getMyAccountProfile } from "@/app/actions/account"
import { getMyTickets } from "@/app/actions/tickets"
import { OnboardingBanner } from "@/components/account/onboarding-banner"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { formatEventDay, formatEventTime, getInitials } from "@/lib/format"
import { splitTicketsBySchedule } from "@/lib/ticket-schedule"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Portal del comprador TokePass: entradas y perfil.",
}

export default async function CuentaHomePage() {
  const [profile, tickets] = await Promise.all([
    getMyAccountProfile(),
    getMyTickets().catch(() => []),
  ])

  const { upcoming, past } = splitTicketsBySchedule(tickets)
  const validCount = upcoming.length
  const nextTicket = [...upcoming].sort(
    (a, b) =>
      new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
  )[0]

  const displayName = profile.fullName || profile.email.split("@")[0] || "Vos"
  const hasDni = profile.dni.replace(/\D/g, "").length >= 7

  return (
    <section className="space-y-6">
      <header className="flex items-center gap-4 lg:hidden">
        <span className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-emerald-500/15 text-lg font-bold text-emerald-700 ring-1 ring-emerald-400/25 dark:text-emerald-300">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            getInitials(profile.fullName, profile.email)
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400/90">
            Mi cuenta
          </p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-foreground">
            Hola, {displayName}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
        </div>
      </header>

      <div className="hidden lg:block">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400/90">
          Resumen
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
          Hola, {displayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu próximo show y el estado de la billetera, de un vistazo.
        </p>
      </div>

      <OnboardingBanner hasDni={hasDni} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {nextTicket ? (
          <Link
            href="/cuenta/entradas"
            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm lg:col-span-2"
          >
            <div className="relative aspect-[16/7] min-h-[140px] overflow-hidden bg-muted sm:aspect-[21/8]">
              {nextTicket.flyerUrl ? (
                <Image
                  src={nextTicket.flyerUrl}
                  alt={nextTicket.eventTitle}
                  fill
                  sizes="(max-width: 1024px) 100vw, 640px"
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="absolute inset-0 bg-muted" />
              )}
            </div>
            <div className="space-y-1 px-5 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                Próximo evento
              </p>
              <h2 className="line-clamp-2 text-xl font-extrabold tracking-tight text-foreground">
                {nextTicket.eventTitle}
              </h2>
              <p className="text-sm text-muted-foreground">
                {formatEventDay(nextTicket.eventDate)} ·{" "}
                {formatEventTime(nextTicket.eventDate)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <p className="text-sm text-muted-foreground">
                {nextTicket.tierName}
                {nextTicket.venueName || nextTicket.eventLocation
                  ? ` · ${nextTicket.venueName ?? nextTicket.eventLocation}`
                  : null}
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Ver entrada
                <ChevronRight className="size-4" aria-hidden="true" />
              </span>
            </div>
          </Link>
        ) : (
          <Link
            href="/events"
            className="flex min-h-[180px] flex-col justify-between rounded-2xl border border-border/50 bg-card p-5 shadow-sm lg:col-span-2"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                Próximo evento
              </p>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight text-foreground">
                Todavía no tenés shows en la billetera
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Explorá la cartelera y tu entrada va a aparecer acá lista para
                la puerta.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Explorar
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <OverviewStat
            href="/cuenta/entradas"
            label="Entradas activas"
            value={String(validCount)}
            hint={validCount === 1 ? "Lista para la puerta" : "En tu billetera"}
          />
          <OverviewStat
            href="/cuenta/entradas"
            label="Historial"
            value={String(past.length)}
            hint="Eventos pasados"
          />
        </div>
      </div>

      <div className="hidden grid-cols-3 gap-4 lg:grid">
        <OverviewChip
          href="/events"
          title="Cartelera de eventos"
          description="Fiestas, recitales y más"
          icon={Compass}
        />
        <OverviewChip
          href="/cuenta/favoritos"
          title="Favoritos"
          description="Guardados para más tarde"
          icon={Heart}
        />
        <OverviewChip
          href="/cuenta/compras"
          title="Compras"
          description="Órdenes y comprobantes"
          icon={Receipt}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:hidden">
        <PortalCard
          href="/cuenta/entradas"
          title="Mis entradas"
          description={
            validCount === 1
              ? "Donde guardás tus pases · 1 entrada activa"
              : `Donde guardás tus pases · ${validCount} entradas activas`
          }
          icon={Ticket}
          accent="emerald"
          className="md:col-span-2"
        />
        <PortalCard
          href="/cuenta/compras"
          title="Mis compras"
          description="Órdenes, pagos y comprobantes"
          icon={Receipt}
          accent="sky"
        />
        <PortalCard
          href="/cuenta/favoritos"
          title="Favoritos"
          description="Eventos guardados para más tarde"
          icon={Heart}
          accent="violet"
        />
        <PortalCard
          href="/cuenta/notificaciones"
          title="Notificaciones"
          description="Regalos, compras y avisos de tu cuenta"
          icon={Bell}
          accent="sky"
        />
        <PortalCard
          href="/cuenta/perfil"
          title="Mis datos personales"
          description="Nombre, DNI, teléfono y foto de perfil"
          icon={UserRound}
          accent="violet"
        />
        <PortalCard
          href="/events"
          title="Explorar"
          description="Descubrí fiestas, recitales y más"
          icon={Compass}
          accent="sky"
        />
      </div>

      <SignOutButton
        label="Salir de mi cuenta"
        className="mt-2 h-12 w-full justify-center rounded-2xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground md:w-auto md:min-w-48 md:px-8 lg:hidden"
      />
    </section>
  )
}

function OverviewStat({
  href,
  label,
  value,
  hint,
}: {
  href: string
  label: string
  value: string
  hint: string
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm transition hover:bg-muted/40"
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Link>
  )
}

function OverviewChip({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string
  title: string
  description: string
  icon: typeof Ticket
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-sm transition hover:bg-muted/40"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  )
}

function PortalCard({
  href,
  title,
  description,
  icon: Icon,
  accent,
  className,
}: {
  href: string
  title: string
  description: string
  icon: typeof Ticket
  accent: "emerald" | "violet" | "sky"
  className?: string
}) {
  const accents = {
    emerald:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-400/20 dark:text-emerald-300",
    violet:
      "bg-violet-500/15 text-violet-700 ring-violet-400/20 dark:text-violet-300",
    sky: "bg-sky-500/15 text-sky-700 ring-sky-400/20 dark:text-sky-300",
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/60",
        className,
      )}
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${accents[accent]}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  )
}
