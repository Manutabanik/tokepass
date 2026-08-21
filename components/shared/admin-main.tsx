"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  isAdminFocusedFlow,
  isEventStudioPath,
} from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

export function AdminMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const focused = isAdminFocusedFlow(pathname)
  const workspace = isEventStudioPath(pathname)
  const posTerminal =
    pathname.startsWith("/dashboard/pos") || pathname.startsWith("/admin/pos")
  const createWizard =
    pathname.startsWith("/admin/events/create") ||
    pathname.startsWith("/admin/events/new")

  if (workspace) {
    return (
      <main className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden bg-background text-foreground">
        {children}
      </main>
    )
  }

  return (
    <main
      className={cn(
        "mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-6 sm:px-8 lg:px-10",
        posTerminal || createWizard
          ? "flex min-h-0 flex-col overflow-hidden pb-4"
          : focused
            ? "flex min-h-0 flex-col overflow-y-auto pb-4"
            : "min-h-0 space-y-6 overflow-y-auto pb-12 max-lg:pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
      )}
    >
      {children}
    </main>
  )
}
