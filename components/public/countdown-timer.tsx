"use client"

import { useEffect, useRef, useState } from "react"

import { formatHoldCountdown, GA_CHECKOUT_HOLD_MINUTES } from "@/lib/checkout-hold"
import { cn } from "@/lib/utils"

export function CountdownTimer({
  expiresAt,
  initialMinutes = GA_CHECKOUT_HOLD_MINUTES,
  onExpire,
  className,
  compact = false,
}: {
  expiresAt?: string | null
  initialMinutes?: number
  onExpire?: () => void
  className?: string
  compact?: boolean
}) {
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    expiredRef.current = false
    const end = expiresAt
      ? new Date(expiresAt).getTime()
      : Date.now() + initialMinutes * 60 * 1000

    function tick() {
      const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemainingSeconds(seconds)
      if (seconds > 0 || expiredRef.current) return
      expiredRef.current = true
      onExpireRef.current?.()
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt, initialMinutes])

  const urgent = remainingSeconds <= 60

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        urgent &&
          (compact
            ? "text-destructive"
            : "underline decoration-2 underline-offset-4"),
        className,
      )}
    >
      {formatHoldCountdown(remainingSeconds)}
    </span>
  )
}
