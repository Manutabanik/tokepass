"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  isAdminFocusedFlow,
  isVenueMapWorkspace,
} from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

export function AdminMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const focused = isAdminFocusedFlow(pathname)
  const workspace = isVenueMapWorkspace(pathname)
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
        "mx-auto w-full max-w-[1600px] flex-1 px-4 pt-6 sm:px-8 lg:px-10",
        posTerminal || createWizard
          ? "flex min-h-0 flex-1 flex-col overflow-hidden pb-4"
          : focused
            ? "flex min-h-[calc(100dvh-5rem)] flex-col pb-4"
            : "space-y-6 pb-12 max-lg:pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
      )}
    >
      {children}
    </main>
  )
}
