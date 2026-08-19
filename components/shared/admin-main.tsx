"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { isAdminFocusedFlow } from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

export function AdminMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const focused = isAdminFocusedFlow(pathname)

  return (
    <main
      className={cn(
        "mx-auto min-h-0 w-full max-w-[1600px] flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain",
        "px-4 pt-4 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10",
        focused
          ? "flex min-h-0 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]"
          : "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-10",
      )}
    >
      {children}
    </main>
  )
}
