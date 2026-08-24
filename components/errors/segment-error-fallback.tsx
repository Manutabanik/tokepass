"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { AlertTriangle, RefreshCw } from "lucide-react"

import {
  TOKEPASS_ERROR_LEAD,
  TOKEPASS_ERROR_TITLE,
  TokepassErrorScreen,
} from "@/components/errors/tokepass-error-screen"
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
  homeLabel = "Ir al inicio",
}: SegmentErrorFallbackProps) {
  useEffect(() => {
    logger.error({
      context: logContext,
      message: "route_error_boundary",
      digest: error.digest,
      error,
    })
    try {
      Sentry.captureException(error, {
        tags: {
          context: logContext,
          ...(error.digest ? { digest: error.digest } : {}),
        },
      })
    } catch {
      // No bloquear la UI de recuperación si Sentry falla.
    }
  }, [error, logContext])

  return (
    <TokepassErrorScreen
      reset={reset}
      homeHref={homeHref}
      homeLabel={homeLabel}
      title={TOKEPASS_ERROR_TITLE}
      lead={TOKEPASS_ERROR_LEAD}
      resetLabel="Volver a intentar"
      icon={
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
      }
      resetIcon={<RefreshCw className="size-4" aria-hidden />}
    />
  )
}
