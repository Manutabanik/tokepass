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
    <main className="relative isolate grid min-h-[70vh] place-items-center overflow-hidden bg-[#09090b] px-6 py-16 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.2),transparent_45%)]" />
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950/70 p-8 text-center">
        <img
          src="/brand/tokepass-mark.png"
          alt="Tokepass"
          width={48}
          height={48}
          className="mx-auto size-12 rounded-[0.85rem] object-cover ring-1 ring-white/15"
        />
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
          No pudimos cargar esta vista
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
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
            className="grid h-11 place-items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-zinc-200 hover:bg-white/5"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
