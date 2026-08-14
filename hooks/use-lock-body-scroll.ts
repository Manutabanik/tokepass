import { useEffect } from "react"

/** Locks document scroll while a fullscreen overlay (map takeover) is open. */
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const body = document.body
    const html = document.documentElement
    const previousBody = body.style.overflow
    const previousHtml = html.style.overflow
    body.style.overflow = "hidden"
    html.style.overflow = "hidden"
    return () => {
      body.style.overflow = previousBody
      html.style.overflow = previousHtml
    }
  }, [locked])
}
