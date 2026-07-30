"use client"

import { useEffect } from "react"
import Link from "next/link"

import { logger } from "@/lib/logger"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error({
      context: "app/global-error",
      message: "global_error_boundary",
      digest: error.digest,
      error,
    })
  }, [error])

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
        <main className="grid min-h-screen place-items-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/80 p-8 text-center shadow-2xl shadow-black/40">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
              Tokepass
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white">
              Algo se rompió
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Error crítico de la aplicación. Podés reintentar o volver al
              inicio.
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
                Ir al inicio
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
