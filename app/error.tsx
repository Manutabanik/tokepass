"use client"

import { SegmentErrorFallback } from "@/components/errors/segment-error-fallback"

export default function Error({
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
      logContext="app/error"
      homeHref="/"
    />
  )
}
