import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export const DRAFT_FIELD_CLASS =
  "h-12 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 transition-all duration-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 md:text-sm dark:border-gray-700 dark:bg-gray-900/80 dark:text-white"

export const DRAFT_DIALOG_CLASS = "w-[95vw] max-w-lg"

export const DRAFT_TEXTAREA_CLASS =
  "min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 transition-all duration-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-gray-700 dark:bg-gray-900/80 dark:text-white"

export const DRAFT_TICKET_CARD_CLASS =
  "relative rounded-xl border border-slate-200 bg-white/80 p-4 pt-12 transition-all duration-200 hover:border-slate-300 dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:border-gray-600"

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
        "rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-all duration-200 sm:p-5 dark:border-gray-800 dark:bg-gray-950/70",
        className,
      )}
    >
      {children}
    </section>
  )
}

export function DraftHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>
}

export function DraftAddButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-transparent px-4 py-3 text-sm font-medium text-gray-400 transition-all duration-200 hover:border-emerald-500/50 hover:text-emerald-400 dark:border-gray-700"
    >
      {children}
    </button>
  )
}

export function DraftFieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-500">{message}</p>
}

export function DraftFieldLabel({
  htmlFor,
  required = false,
  optional = false,
  className,
  children,
}: {
  htmlFor?: string
  required?: boolean
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn(
        "text-xs font-bold text-slate-800 dark:text-zinc-200",
        className,
      )}
    >
      {children}
      {required ? (
        <>
          {" "}
          <span className="text-red-500">*</span>
        </>
      ) : null}
      {optional ? (
        <>
          {" "}
          <span className="text-muted-foreground text-sm font-normal">(Opcional)</span>
        </>
      ) : null}
    </Label>
  )
}
