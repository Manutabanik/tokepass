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
import Link from "next/link"

import { getMyAccountProfile } from "@/app/actions/account"
import { getMyTickets } from "@/app/actions/tickets"
import { OnboardingBanner } from "@/components/account/onboarding-banner"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { getInitials } from "@/lib/format"
import { countActiveTickets } from "@/lib/ticket-schedule"

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Portal del comprador Tokepass: entradas y perfil.",
}

export default async function CuentaHomePage() {
  const [profile, tickets] = await Promise.all([
    getMyAccountProfile(),
    getMyTickets().catch(() => []),
  ])

  const validCount = countActiveTickets(tickets)

  const displayName = profile.fullName || profile.email.split("@")[0] || "Vos"
  const hasDni = profile.dni.replace(/\D/g, "").length >= 7

  return (
    <section className="space-y-6 py-8">
      <header className="flex items-center gap-4">
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

      <OnboardingBanner hasDni={hasDni} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        <PortalCard
          href="/cuenta/entradas"
          title="Mis entradas"
          description={
            validCount === 1
              ? "1 entrada activa en tu billetera"
              : `${validCount} entradas activas en tu billetera`
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
          title="Mis Datos"
          description="Nombre, DNI, teléfono y foto de perfil"
          icon={UserRound}
          accent="violet"
        />
        <PortalCard
          href="/events"
          title="Explorar eventos"
          description="Descubrí fiestas, recitales y más"
          icon={Compass}
          accent="sky"
        />
      </div>

      <SignOutButton className="mt-2 h-12 w-full justify-center rounded-2xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground md:w-auto md:min-w-48 md:px-8" />
    </section>
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
      className={`flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/60 ${className ?? ""}`}
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
