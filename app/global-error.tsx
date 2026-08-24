"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { TokepassErrorScreen } from "@/components/errors/tokepass-error-screen"

import "./globals.css"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    try {
      Sentry.captureException(error, {
        tags: {
          context: "app/global-error",
          ...(error.digest ? { digest: error.digest } : {}),
        },
      })
    } catch {
      // El layout ya falló: no bloquear la pantalla de recuperación.
    }
  }, [error])

  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <TokepassErrorScreen
          standalone
          reset={reset}
          homeHref="/"
          homeLabel="Ir al inicio"
          resetLabel="Volver a intentar"
          icon={
            <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
              <AlertTriangle className="size-7" aria-hidden />
            </span>
          }
          resetIcon={<RefreshCw className="size-4" aria-hidden />}
        />
      </body>
    </html>
  )
}
