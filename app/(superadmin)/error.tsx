"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function SuperadminError({
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
      logContext="app/(superadmin)/error"
      homeHref="/superadmin"
      homeLabel="Volver al panel"
    />
  )
}
