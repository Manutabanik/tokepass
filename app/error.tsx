"use client"

import { useEffect } from "react"
import Link from "next/link"

import { logger } from "@/lib/logger"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error({
      context: "app/error",
      message: "route_error_boundary",
      digest: error.digest,
      error,
    })
  }, [error])

  return (
    <main className="relative isolate grid min-h-[70vh] place-items-center overflow-hidden bg-background px-6 py-16 text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.16),transparent_45%)]" />
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
        <img
          src="/brand/tokepass-mark.png"
          alt="Tokepass"
          width={48}
          height={48}
          className="mx-auto size-12 rounded-[0.85rem] object-cover ring-1 ring-white/15"
        />
        <h1 className="mt-4 text-3xl font-black tracking-tight text-foreground">
          No pudimos cargar esta vista
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Hubo un error inesperado. Reintentá la operación o volvé a la
          cartelera.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-full bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="grid h-11 place-items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
