import type { Metadata } from "next"
import Link from "next/link"
import {
  Gauge,
  MapPinned,
  ScanLine,
  ShieldCheck,
} from "lucide-react"

import { OrganizerLeadForm } from "@/components/public/organizer-lead-form"
import { commercialWhatsAppHref } from "@/lib/commercial-contact"

export const metadata: Metadata = {
  title: "Organizadores",
  description:
    "Control de accesos, mapas interactivos y metricas en tiempo real para productoras. Solicita tu cuenta Tokepass.",
}

const FEATURES = [
  {
    title: "Acreditacion veloz",
    body: "App de escaneo offline-first. Living QR dinamico, validacion en puerta aunque corte internet.",
    icon: ScanLine,
  },
  {
    title: "Mapas de asientos y mesas VIP",
    body: "Planos tactiles para living, mesas y plateas. El comprador elige el lugar y vos ves el aforo en vivo.",
    icon: MapPinned,
  },
  {
    title: "Metricas en tiempo real",
    body: "Ventas, check-in y ocupacion en un panel. Sin planillas ni recuentos a mano a las 2 de la manana.",
    icon: Gauge,
  },
  {
    title: "Seguridad anti-reventa",
    body: "Entradas nominadas, transferencias controladas y stock atomico. Cada QR es de una persona, no de un PDF.",
    icon: ShieldCheck,
  },
] as const

export default function OrganizadoresPage() {
  const whatsappHref = commercialWhatsAppHref(
    "Hola Tokepass, quiero solicitar acceso de organizador.",
  )

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-zinc-950 text-zinc-50">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_42%)]"
        aria-hidden="true"
      />

      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:px-8">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
          Tokepass para productoras
        </p>
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h1 className="text-balance text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Control de accesos, metricas en vivo y mapas interactivos.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg">
              Operá la puerta, el living y la boleteria desde un solo sistema.
              El alta es asistida: Tokepass configura tu primer evento con vos.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#solicitud"
                className="inline-flex h-12 min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Solicitar acceso
              </a>
              <Link
                href="/login-organizador"
                className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100 transition hover:bg-white/5"
              >
                Ya tengo cuenta
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 text-sm text-zinc-300">
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Escaneo en puerta en menos de un segundo.
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Mesas, livings y plateas con QR individual por acceso.
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Stock atomico: no se sobrevende ni se duplica el hold.
            </li>
          </ul>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Lo que opera tu equipo el dia del evento
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ title, body, icon: Icon }) => (
            <article
              key={title}
              className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5 sm:p-6"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="solicitud"
        className="relative mx-auto max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6 lg:px-8"
      >
        <div className="grid gap-8 rounded-3xl border border-white/10 bg-zinc-900/80 p-5 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Solicita tu cuenta de organizador
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
              Completa el formulario y el equipo de Tokepass arma el evento
              con vos. No hay registro libre: cada productora se valida antes
              de operar cobros.
            </p>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-emerald-400/40 px-5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
              >
                Preferis WhatsApp
              </a>
            ) : null}
          </div>
          <OrganizerLeadForm whatsappHref={whatsappHref} />
        </div>
      </section>
    </div>
  )
}
