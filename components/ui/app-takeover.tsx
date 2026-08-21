import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function AppTakeover({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
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
