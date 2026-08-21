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
  const posTerminal =
    pathname.startsWith("/dashboard/pos") || pathname.startsWith("/admin/pos")
  const createWizard =
    pathname.startsWith("/admin/events/create") ||
    pathname.startsWith("/admin/events/new")
  const lockViewport = posTerminal || createWizard

  useLayoutEffect(() => {
    if (!workspace && !lockViewport) return
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
  }, [lockViewport, workspace])

  if (workspace) {
    return (
      <div className="flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-background text-foreground">
        {children}
      </div>
    )
  }

  return (
    <div
      className={
        lockViewport
          ? "flex h-dvh w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950"
          : "flex min-h-screen w-full bg-zinc-50 dark:bg-zinc-950"
      }
    >
      {sidebar}
      <div
        className={
          lockViewport
            ? "flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "flex min-h-screen min-w-0 flex-1 flex-col"
        }
      >
        {header}
        {children}
      </div>
      {footer}
      {extra}
    </div>
  )
}
