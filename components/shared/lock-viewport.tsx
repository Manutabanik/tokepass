"use client"

import { useLayoutEffect } from "react"

/** Impide que html/body scrolleen y rompan el ancla de los dashboards. */
export function LockViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const body = document.body
    const previousRoot = root.style.overflow
    const previousBody = body.style.overflow
    root.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      root.style.overflow = previousRoot
      body.style.overflow = previousBody
    }
  }, [])

  return null
}
