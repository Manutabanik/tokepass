"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function DashboardPosError({
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
      logContext="app/(admin)/dashboard/pos/error"
      homeHref="/admin"
      homeLabel="Ir al inicio"
    />
  )
}
