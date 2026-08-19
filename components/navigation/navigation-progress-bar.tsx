"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"

function NavigationProgressBarInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const routeKeyRef = useRef(routeKey)
  const activeRef = useRef(false)
  const hideTimerRef = useRef<number | null>(null)
  const tickTimerRef = useRef<number | null>(null)

  useEffect(() => {
    function clearTimers() {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current)
      hideTimerRef.current = null
      tickTimerRef.current = null
    }

    function start() {
      clearTimers()
      activeRef.current = true
      setVisible(true)
      setProgress(18)
      tickTimerRef.current = window.setInterval(() => {
        setProgress((current) => {
          if (current >= 90) return current
          return current + Math.max(0.6, (90 - current) * 0.08)
        })
      }, 200)
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return
      }

      start()
    }

    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      clearTimers()
    }
  }, [])

  useEffect(() => {
    if (routeKeyRef.current === routeKey) return
    routeKeyRef.current = routeKey
    if (!activeRef.current) return
    activeRef.current = false
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current)
    tickTimerRef.current = null
    setProgress(100)
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 220)
  }, [routeKey])

  if (!visible && progress === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]"
      role="progressbar"
      aria-hidden="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full origin-left bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.85)] transition-[transform] duration-200 ease-out"
        style={{ transform: `scaleX(${Math.min(progress, 100) / 100})` }}
      />
    </div>
  )
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBarInner />
    </Suspense>
  )
}
