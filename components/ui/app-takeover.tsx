"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"

import { releaseTakeoverLock } from "@/lib/dom/blur-active-element"
import { cn } from "@/lib/utils"

export function AppTakeover({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node) return
    let raf = 0
    const observer = new MutationObserver(() => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        observer.disconnect()
        releaseTakeoverLock(node)
        observer.observe(node, {
          attributes: true,
          attributeFilter: ["aria-hidden", "inert", "data-base-ui-inert"],
        })
      })
    })
    releaseTakeoverLock(node)
    observer.observe(node, {
      attributes: true,
      attributeFilter: ["aria-hidden", "inert", "data-base-ui-inert"],
    })
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      data-slot="app-takeover"
      className={cn(
        "fixed inset-0 z-[80] flex h-dvh min-h-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {children}
    </div>
  )
}
