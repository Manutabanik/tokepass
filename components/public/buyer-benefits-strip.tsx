"use client"

import Link from "next/link"
import { Mail, Map, QrCode } from "lucide-react"

export function BuyerBenefitsStrip() {
  return (
    <section className="mt-16 rounded-3xl border border-zinc-200 bg-white px-5 py-10 dark:border-white/8 dark:bg-zinc-900/60 sm:px-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            Beneficios
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Comprar y entrar, sin PDF ni filas.
          </h2>
        </div>
        <Link
          href="/beneficios"
          className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
        >
          Ver beneficios
        </Link>
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        <li className="flex gap-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <Mail className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          Entrega instantanea por mail y acceso web.
        </li>
        <li className="flex gap-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <QrCode className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          QR nominado por persona o por acceso de mesa.
        </li>
        <li className="flex gap-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <Map className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          Mapa tactil pensado para el celular.
        </li>
      </ul>
    </section>
  )
}
