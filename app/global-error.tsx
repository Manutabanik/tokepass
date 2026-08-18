"use client"

import { useEffect } from "react"
import Link from "next/link"
import * as Sentry from "@sentry/nextjs"
import { TriangleAlert } from "lucide-react"

import "./globals.css"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        context: "app/global-error",
        ...(error.digest ? { digest: error.digest } : {}),
      },
    })
  }, [error])

  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased [@media(prefers-color-scheme:dark)]:bg-zinc-950 [@media(prefers-color-scheme:dark)]:text-zinc-100">
        <main className="grid min-h-screen place-items-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl [@media(prefers-color-scheme:dark)]:border-white/10 [@media(prefers-color-scheme:dark)]:bg-zinc-950/80">
            <div className="mx-auto grid size-12 place-items-center rounded-[0.85rem] bg-violet-600/10 text-violet-600 ring-1 ring-violet-500/20 [@media(prefers-color-scheme:dark)]:bg-violet-400/10 [@media(prefers-color-scheme:dark)]:text-violet-300">
              <TriangleAlert className="size-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight">
              Algo salió mal
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600 [@media(prefers-color-scheme:dark)]:text-zinc-400">
              Tuvimos un problema al cargar la aplicación. Podés reintentar o
              volver al inicio.
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
                className="grid h-11 place-items-center rounded-full border border-zinc-200 px-5 text-sm font-semibold hover:bg-zinc-100 [@media(prefers-color-scheme:dark)]:border-white/15 [@media(prefers-color-scheme:dark)]:hover:bg-white/5"
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
