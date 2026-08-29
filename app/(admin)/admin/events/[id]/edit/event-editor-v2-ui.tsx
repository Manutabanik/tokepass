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

export const BENTO_GRID_CLASS =
  "grid grid-cols-1 items-stretch gap-6 md:grid-cols-12"

export const BENTO_INVENTORY_GRID_CLASS = "flex w-full flex-col gap-4"

export const SUPER_PANEL_ITEM_CLASS =
  "not-last:border-b-0 mb-4 overflow-hidden rounded-2xl border border-border/50 bg-card px-3 shadow-sm last:mb-0"

export const BENTO_CARD_CLASS =
  "flex h-full flex-col rounded-2xl border border-border/50 bg-card p-6 shadow-sm"

export function DraftCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(BENTO_CARD_CLASS, className)}>
      {children}
    </section>
  )
}

export function SplitRowSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "mb-8 grid grid-cols-1 gap-8 border-b border-border/50 pb-8 md:grid-cols-3",
        className,
      )}
    >
      <div className="md:col-span-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 md:col-span-2">{children}</div>
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
