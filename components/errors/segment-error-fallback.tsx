"use client"

import { useEffect } from "react"

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
  }, [error, logContext])

  return (
    <TokepassErrorScreen
      reset={reset}
      homeHref={homeHref}
      homeLabel={homeLabel}
      title={TOKEPASS_ERROR_TITLE}
      lead={TOKEPASS_ERROR_LEAD}
      resetLabel="Reintentar cargar"
    />
  )
}
