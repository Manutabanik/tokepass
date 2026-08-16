"use client"

import { useEffect, useRef, useState } from "react"

import { formatHoldCountdown } from "@/lib/checkout-hold"
import { cn } from "@/lib/utils"

export function CountdownTimer({
  expiresAt,
  initialMinutes = 10,
  onExpire,
  className,
}: {
  expiresAt?: string | null
  initialMinutes?: number
  onExpire?: () => void
  className?: string
}) {
  const deadline = expiresAt
    ? new Date(expiresAt).getTime()
    : Date.now() + initialMinutes * 60 * 1000
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  )

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
        urgent && "underline decoration-2 underline-offset-4",
        className,
      )}
    >
      {formatHoldCountdown(remainingSeconds)}
    </span>
  )
}
