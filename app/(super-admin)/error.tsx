"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function SuperAdminAliasError({
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
      logContext="app/(super-admin)/error"
      homeHref="/super-admin"
      homeLabel="Volver al panel"
    />
  )
}
