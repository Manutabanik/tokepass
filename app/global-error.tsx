"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

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
          resetLabel="Reintentar cargar"
        />
      </body>
    </html>
  )
}
