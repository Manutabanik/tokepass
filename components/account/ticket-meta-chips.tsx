import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Chip({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full bg-foreground/5 px-2.5 py-1 text-[clamp(0.6875rem,2.5vw,0.75rem)] font-semibold leading-tight text-muted-foreground ring-1 ring-inset ring-border/60 dark:bg-foreground/10",
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Labels must be unique; `walletTicketMetaChips` already guarantees it. */
export function TicketMetaChips({
  labels,
  className,
}: {
  labels: string[]
  className?: string
}) {
  if (labels.length === 0) return null
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {labels.map((label) => (
        <Chip key={label}>{label}</Chip>
      ))}
    </div>
  )
}
