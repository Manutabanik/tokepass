"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function PromoterError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SegmentErrorFallback
      error={error}
      reset={reset}
      logContext="app/(promoter)/error"
      homeHref="/promoter/dashboard"
      homeLabel="Volver al panel"
    />
  )
}
