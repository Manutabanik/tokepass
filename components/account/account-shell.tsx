"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { isAccountFocusedFlow } from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const focused = isAccountFocusedFlow(pathname)

  return (
    <div
      className={cn(
        "min-w-0",
        focused
          ? "pb-[max(1rem,env(safe-area-inset-bottom))]"
          : "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-4 lg:pb-0",
      )}
    >
      {children}
    </div>
  )
}
