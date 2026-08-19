"use client"

import { useEffect, useState } from "react"

const THRESHOLD_PX = 10

/**
 * Detects vertical scroll direction with a small threshold to ignore micro-movements.
 * Defaults to `"up"` so UI that depends on it stays visible until the user scrolls down.
 */
export function useScrollDirection(): "up" | "down" {
  const [direction, setDirection] = useState<"up" | "down">("up")

  useEffect(() => {
    let lastY = window.scrollY

    function onScroll() {
      const y = Math.max(0, window.scrollY)

      if (y <= THRESHOLD_PX) {
        setDirection("up")
        lastY = y
        return
      }

      const delta = y - lastY
      if (Math.abs(delta) < THRESHOLD_PX) return

      setDirection(delta > 0 ? "down" : "up")
      lastY = y
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return direction
}
