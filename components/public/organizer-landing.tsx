import Link from "next/link"
import { ArrowRight, Shield, Smartphone, Wallet, Zap } from "lucide-react"

import { LandingReveal } from "@/components/public/landing-reveal"
import { ORGANIZER_REGISTER_HREF, commercialWhatsAppHref } from "@/lib/commercial-contact"
import { cn } from "@/lib/utils"

const LEAD_MESSAGE =
  "Hola TokePass, quiero crear una cuenta de organizador."

const PAIN_POINTS = [
  {
    title: "Tu plata no se retiene.",
    body: "Se terminó eso de rogarle a la tiquetera para que te suelte los fondos tres semanas después del evento. Cuentas claras, reportes al instante y la plata cuando la necesitás para seguir produciendo.",
    icon: Wallet,
  },
  {
    title: "Chau a la captura de pantalla y el PDF falso.",
    body: "Un PDF se puede reenviar a 100 personas y te arruina la puerta. Nuestro sistema hace que la entrada sirva solo para el que la compró. El que compra es el que entra. Punto. Se acabó la reventa y el mercado negro en tu puerta.",
    icon: Shield,
  },
  {
    title: "La puerta no frena ni aunque se caiga el Wi-Fi.",
    body: "¿Se cortó internet en la entrada del boliche o el estadio? No pasa nada. Nuestra app de escaneo sigue leyendo entradas a la velocidad de la luz sin conexión. Sin cuellos de botella, sin gente quejándose en la fila.",
    icon: Zap,
  },
] as const

function MapPreview() {
  const seats = [
    [0, 1, 1, 2, 2, 1, 1, 0],
    [1, 1, 2, 2, 2, 2, 1, 1],
    [1, 3, 3, 2, 2, 3, 3, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ]

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/80 p-5 shadow-[0_30px_80px_-40px_rgba(139,92,246,0.7)] sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Elegí tu lugar
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200">
          <Smartphone className="size-3.5" aria-hidden="true" />
          Desde el celu
        </span>
      </div>
      <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-4">
        <div className="mb-4 rounded-lg bg-violet-500/20 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200">
          Escenario
        </div>
        <div className="grid gap-2">
          {seats.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-8 gap-1.5">
              {row.map((cell, cellIndex) => (
                <span
                  key={`${rowIndex}-${cellIndex}`}
                  className={cn(
                    "aspect-square rounded-md",
                    cell === 0 && "bg-transparent",
                    cell === 1 && "bg-zinc-800",
                    cell === 2 &&
                      "bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.45)]",
                    cell === 3 && "bg-emerald-400/80",
                  )}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-violet-500" />
            Mesa
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-400/80" />
            Living
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-zinc-800" />
            General
          </span>
        </div>
      </div>
    </div>
  )
}

function SalesPreview() {
  const bars = [42, 58, 51, 76, 88, 64, 93]

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/80 p-5 shadow-[0_30px_80px_-40px_rgba(16,185,129,0.45)] sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Ventas de hoy
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          En vivo
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {[
          { label: "Vendidas", value: "1.284" },
          { label: "Promedio", value: "$18.400" },
          { label: "En puerta", value: "312" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-white/8 bg-zinc-950/70 px-3 py-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {kpi.label}
            </p>
            <p className="mt-1 text-lg font-black tracking-tight text-white sm:text-xl">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-28 items-end gap-2 rounded-2xl border border-white/8 bg-zinc-950/70 px-4 py-3">
        {bars.map((height, index) => (
          <span
            key={index}
            className="flex-1 rounded-t-md bg-gradient-to-t from-violet-700 to-fuchsia-400"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function OrganizerLanding() {
  const whatsappHref = commercialWhatsAppHref(LEAD_MESSAGE)

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-[#05050a] text-zinc-50">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(124,58,237,0.22),_transparent_42%)]"
        aria-hidden="true"
      />

      <section className="relative mx-auto flex min-h-[min(88vh,52rem)] max-w-5xl flex-col items-center justify-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-20 lg:px-8">
        <LandingReveal>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300 sm:text-xs sm:tracking-[0.28em]">
            Basta de tiqueteras del siglo pasado.
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[2rem] font-black leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Tu plata segura. Tu puerta más rápida que nunca.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
            Armamos la boletería que las otras tiqueteras no quieren que
            tengas. Control total de tu recaudación, cero colados con PDFs
            truchos y venta de mesas desde el celular. Todo pensado para que
            vos ganes más y reniegues menos.
          </p>
          <Link
            href={ORGANIZER_REGISTER_HREF}
            className="mt-10 inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 text-sm font-semibold text-white shadow-[0_12px_40px_-12px_rgba(139,92,246,0.9)] transition hover:from-violet-500 hover:to-fuchsia-500 sm:w-auto"
          >
            Crear cuenta de Organizador
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </LandingReveal>
      </section>

      <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {PAIN_POINTS.map(({ title, body, icon: Icon }, index) => (
            <LandingReveal key={title} delay={index * 0.08}>
              <article className="h-full rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-6 sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-violet-500/15 text-violet-200">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-extrabold tracking-tight sm:text-2xl">
                  {title}
                </h2>
                <p className="mt-3 text-base leading-7 text-zinc-400">{body}</p>
              </article>
            </LandingReveal>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl space-y-20 px-4 pb-24 sm:px-6 lg:px-8 lg:space-y-28">
        <LandingReveal>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <MapPreview />
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Que elijan su mesa desde el celu.
              </h2>
              <p className="mt-4 text-pretty text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
                No vendas solo una entrada general. Dejá que tu público elija
                su mesa, su VIP o su living directamente tocando la pantalla
                del celular. Más comodidad para ellos, un ticket promedio
                mucho más alto para vos.
              </p>
            </div>
          </div>
        </LandingReveal>

        <LandingReveal>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Mirá cómo vienen tus ventas en vivo.
              </h2>
              <p className="mt-4 text-pretty text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
                Dejá de esperar el mail del lunes para saber cómo te fue. Entrá
                a tu panel desde el celu en cualquier momento y mirá cuántas
                llevás vendidas, de dónde es tu público y qué publicidad te
                está rindiendo más.
              </p>
            </div>
            <SalesPreview />
          </div>
        </LandingReveal>
      </section>

      <section
        id="solicitud"
        className="relative mx-auto max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6 lg:px-8"
      >
        <LandingReveal>
          <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-700 p-6 sm:p-10 lg:p-12">
            <div className="max-w-3xl">
                <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                  Subí el nivel de tus eventos.
                </h2>
                <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-violet-100 sm:text-lg sm:leading-8">
                  Unite a los productores que ya exigen transparencia,
                  seguridad de verdad y la mejor tecnología de Argentina en
                  sus puertas.
                </p>
                <p className="mt-4 max-w-xl text-pretty text-sm leading-6 text-violet-100/90">
                  Creá la cuenta y configurá el evento en el panel. La venta al
                  público se habilita cuando TokePass audita fecha, locación y
                  condiciones.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href={ORGANIZER_REGISTER_HREF}
                    className="inline-flex h-12 min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-violet-900 transition hover:bg-violet-50"
                  >
                    Crear cuenta de Organizador
                  </Link>
                  <Link
                    href="/login-organizador"
                    className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Ya tengo cuenta
                  </Link>
                  {whatsappHref ? (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      Hablar con el equipo
                    </a>
                  ) : null}
                </div>
            </div>
          </div>
        </LandingReveal>
      </section>
    </div>
  )
}
