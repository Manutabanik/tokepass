"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function PublicError({
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
      logContext="app/(public)/error"
      homeHref="/"
    />
  )
}
