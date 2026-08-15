"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { ADMIN_BOTTOM_NAV_SPACE } from "@/components/shared/admin-bottom-nav"
import { isAdminFocusedFlow } from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

export function AdminMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const focused = isAdminFocusedFlow(pathname)

  return (
    <main
      className={cn(
        "mx-auto min-h-0 w-full max-w-[1600px] flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 sm:p-8 lg:p-10",
        focused
          ? "pb-[env(safe-area-inset-bottom)]"
          : ADMIN_BOTTOM_NAV_SPACE,
      )}
    >
      {children}
    </main>
  )
}
