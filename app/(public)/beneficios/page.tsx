import type { Metadata } from "next"
import Link from "next/link"
import { Mail, Map, QrCode } from "lucide-react"

export const metadata: Metadata = {
  title: "Beneficios",
  description:
    "Entradas digitales instantaneas, QR nominados y mapa tactil para comprar tu lugar en Tokepass.",
}

const BENEFITS = [
  {
    title: "Entrega instantanea",
    body: "Pagás y las entradas llegan al correo y a tu cuenta web. Sin PDF perdido, sin filas en boleteria.",
    icon: Mail,
  },
  {
    title: "QR nominados",
    body: "Cada persona o cada acceso de mesa tiene su propio codigo. Podes transferir con control, no reenviar un pantallazo.",
    icon: QrCode,
  },
  {
    title: "Mapa tactil en el celular",
    body: "Elegi mesa, living o platea con el dedo. El mapa esta pensado para una mano, no para una notebook.",
    icon: Map,
  },
] as const

export default function BeneficiosPage() {
  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-background">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_46%)]"
        aria-hidden="true"
      />
      <section className="relative mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:px-8">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
          Para quienes van al evento
        </p>
        <h1 className="text-balance text-4xl font-black tracking-tight text-foreground sm:text-5xl">
          Tu entrada, en el mail y en el celular, en segundos.
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          Tokepass esta hecho para comprar rapido y entrar sin friccion. El
          codigo vive en la web: funciona aunque el telefono no tenga senal en
          la puerta.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-12 min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Ver eventos
          </Link>
          <Link
            href="/login?next=/cuenta/entradas"
            className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Ir a mis entradas
          </Link>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {BENEFITS.map(({ title, body, icon: Icon }) => (
            <article
              key={title}
              className="rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
