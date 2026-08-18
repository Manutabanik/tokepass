"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function OrganizerCtaBanner() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white px-6 py-12 dark:border-white/8 dark:bg-zinc-900/60 sm:px-10 sm:py-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(124,58,237,0.12),_transparent_55%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Publicá tu evento en Tokepass
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-pretty text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
          La plataforma de boletería digital más rápida, segura e intuitiva.
        </p>
        <Link
          href="/organizadores#solicitud"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
        >
          Solicitar acceso de organizador
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
