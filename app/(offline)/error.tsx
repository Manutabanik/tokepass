"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function OfflineError({
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
      logContext="app/(offline)/error"
      homeHref="/offline/billetera"
      homeLabel="Volver a la billetera"
    />
  )
}
