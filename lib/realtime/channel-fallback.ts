export const REALTIME_POLL_FALLBACK_MS = 12_000

export function isRealtimeChannelDegraded(status: string): boolean {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT"
}

export function startRealtimePollFallback(input: {
  poll: () => void
  intervalMs?: number
}): { stop: () => void } {
  input.poll()
  const intervalMs = input.intervalMs ?? REALTIME_POLL_FALLBACK_MS
  const timer = setInterval(() => {
    input.poll()
  }, intervalMs)
  return {
    stop() {
      clearInterval(timer)
    },
  }
}
