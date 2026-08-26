"use client"

import { ArrowLeft, Rocket, Ticket, Type, WifiOff } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import type { DraftSaveBadgeTone } from "@/lib/events/editor-v2-ux"
import { cn } from "@/lib/utils"

export const EDITOR_V2_STEPS = [
  {
    id: 1,
    label: "Información",
    hint: "Nombre, fechas e imágenes",
    icon: Type,
  },
  {
    id: 2,
    label: "Entradas",
    hint: "Aforo, tickets y extras",
    icon: Ticket,
  },
  {
    id: 3,
    label: "Lanzamiento",
    hint: "Revisión y publicación",
    icon: Rocket,
  },
] as const

export type EditorV2StepId = (typeof EDITOR_V2_STEPS)[number]["id"]

export function EventEditorV2StickyHeader({
  step,
  ticketsLabel,
  badge,
  previewAction,
  primaryAction,
  onStep,
  onRetrySave,
}: {
  step: EditorV2StepId
  ticketsLabel: string
  badge: { label: string; tone: DraftSaveBadgeTone }
  previewAction?: ReactNode
  primaryAction?: ReactNode
  onStep: (step: EditorV2StepId) => void
  onRetrySave?: () => void
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/admin/events"
          aria-label="Volver al panel"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <nav
          className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto"
          aria-label="Pasos del editor"
        >
          {EDITOR_V2_STEPS.map((item) => {
            const current = item.id === step
            const label = item.id === 2 ? ticketsLabel : item.label
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onStep(item.id)}
                aria-current={current ? "step" : undefined}
                aria-label={label}
                className={cn(
                  "inline-flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-all duration-200",
                  current
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-white/5 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </nav>

        <EventEditorV2SaveBadge
          label={badge.label}
          tone={badge.tone}
          onRetry={badge.tone === "error" ? onRetrySave : undefined}
          className="hidden shrink-0 md:inline-flex"
        />
        {previewAction}
        {primaryAction}
      </div>
    </header>
  )
}

export function EventEditorV2SaveBadge({
  label,
  tone,
  className,
  onRetry,
}: {
  label: string
  tone: DraftSaveBadgeTone
  className?: string
  onRetry?: () => void
}) {
  const canRetry = tone === "error" && Boolean(onRetry)
  const classes = cn(
    "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
    tone === "saving" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    tone === "saved" &&
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    tone === "error" && "bg-red-500/10 text-red-700 dark:text-red-400",
    tone === "offline" &&
      "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    tone === "idle" && "text-muted-foreground",
    canRetry && "cursor-pointer hover:bg-red-500/15",
    className,
  )
  const body = (
    <>
      {tone === "offline" ? <WifiOff className="size-3.5" aria-hidden /> : null}
      {label}
      {canRetry ? (
        <span className="underline underline-offset-2">Reintentar</span>
      ) : null}
    </>
  )
  if (canRetry && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={classes}
        aria-live="polite"
      >
        {body}
      </button>
    )
  }
  return (
    <p className={classes} aria-live="polite">
      {body}
    </p>
  )
}
