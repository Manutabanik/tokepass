import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export const DRAFT_FIELD_CLASS =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-white"

export function DraftCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70",
        className,
      )}
    >
      {children}
    </section>
  )
}

export function DraftFieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-500">{message}</p>
}
