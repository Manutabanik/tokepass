"use client"

import { useEffect } from "react"

import { BrandLogo } from "@/components/shared/brand-logo"
import { logger } from "@/lib/logger"

type SegmentErrorFallbackProps = {
  error: Error & { digest?: string }
  reset: () => void
  logContext: string
  homeHref: string
  homeLabel?: string
}

export function SegmentErrorFallback({
  error,
  reset,
  logContext,
  homeHref,
  homeLabel = "Ir al Inicio",
}: SegmentErrorFallbackProps) {
  useEffect(() => {
    logger.error({
      context: logContext,
      message: "route_error_boundary",
      digest: error.digest,
      error,
    })
  }, [error, logContext])

  return (
    <main className="relative isolate flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.16),transparent_50%)]" />
      <BrandLogo href={null} size="lg" />
      <h2 className="mb-4 mt-8 text-3xl font-black text-foreground">
        Algo salió mal
      </h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        Tuvimos un problema al procesar tu solicitud. Revisá tu conexión e
        intentá de nuevo.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-primary px-8 py-3 font-bold text-primary-foreground transition-all hover:bg-primary/90"
        >
          Reintentar
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = homeHref
          }}
          className="rounded-full bg-secondary px-8 py-3 font-bold text-secondary-foreground transition-all hover:bg-secondary/80"
        >
          {homeLabel}
        </button>
      </div>
    </main>
  )
}
