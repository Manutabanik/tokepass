"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"

import { releaseHiddenFocusAncestor } from "@/lib/dom/blur-active-element"
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

    function release() {
      releaseHiddenFocusAncestor(node)
    }

    release()
    const observer = new MutationObserver(release)
    observer.observe(node, {
      attributes: true,
      attributeFilter: ["aria-hidden", "inert", "data-base-ui-inert"],
    })
    return () => observer.disconnect()
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
