"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { LockViewport } from "@/components/shared/lock-viewport"
import { isEventStudioPath } from "@/lib/navigation/focused-flows"

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
  const workspace = isEventStudioPath(pathname)

  if (workspace) {
    return (
      <div className="flex h-dvh w-full max-w-full flex-col overflow-hidden bg-background text-foreground">
        <LockViewport />
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <LockViewport />
      {sidebar}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        {children}
      </div>
      {footer}
      {extra}
    </div>
  )
}
