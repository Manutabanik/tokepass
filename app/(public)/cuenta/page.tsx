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
    <section className="mx-auto w-full max-w-lg space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-center gap-4">
        <span className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-emerald-500/15 text-lg font-bold text-emerald-300 ring-1 ring-emerald-400/25">
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
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400/90">
            Mi cuenta
          </p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-white">
            Hola, {displayName}
          </h1>
          <p className="truncate text-sm text-zinc-500">{profile.email}</p>
        </div>
      </header>

      <OnboardingBanner hasDni={hasDni} />

      <div className="grid gap-3">
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

      <SignOutButton className="mt-2 h-12 w-full justify-center rounded-2xl border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white" />
    </section>
  )
}

function PortalCard({
  href,
  title,
  description,
  icon: Icon,
  accent,
}: {
  href: string
  title: string
  description: string
  icon: typeof Ticket
  accent: "emerald" | "violet" | "sky"
}) {
  const accents = {
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-400/20",
    sky: "bg-sky-500/15 text-sky-300 ring-sky-400/20",
  }

  return (
    <Link
      href={href}
      className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${accents[accent]}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-sm text-zinc-500">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-zinc-600" aria-hidden="true" />
    </Link>
  )
}
