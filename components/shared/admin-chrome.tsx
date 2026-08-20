"use client"

import { usePathname } from "next/navigation"
import { useLayoutEffect, type ReactNode } from "react"

import { isVenueMapWorkspace } from "@/lib/navigation/focused-flows"

export function AdminChrome({
  sidebar,
  header,
  footer,
  extra,
  children,
}: {
  sidebar: ReactNode
  header: ReactNode
  footer: ReactNode
  extra?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const workspace = isVenueMapWorkspace(pathname)

  useLayoutEffect(() => {
    if (!workspace) return
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
  }, [workspace])

  if (workspace) {
    return (
      <div className="flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-background text-foreground">
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {header}
          {children}
        </div>
      </div>
      {footer}
      {extra}
    </div>
  )
}
