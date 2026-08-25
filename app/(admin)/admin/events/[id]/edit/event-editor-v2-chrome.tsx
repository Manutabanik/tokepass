"use client"

import { Rocket, Ticket, Type, WifiOff } from "lucide-react"

import { Button } from "@/components/ui/button"
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

export function EventEditorV2StepNav({
  step,
  ticketsLabel,
  capacityLabel,
  onStep,
}: {
  step: EditorV2StepId
  ticketsLabel: string
  capacityLabel: string
  onStep: (step: EditorV2StepId) => void
}) {
  const active = EDITOR_V2_STEPS.find((item) => item.id === step)
  const activeLabel = step === 2 ? ticketsLabel : active?.label

  return (
    <>
      <nav className="md:hidden" aria-label="Pasos del editor">
        <div className="flex items-center gap-2">
          {EDITOR_V2_STEPS.map((item) => {
            const current = item.id === step
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onStep(item.id)}
                aria-current={current ? "step" : undefined}
                aria-label={item.id === 2 ? ticketsLabel : item.label}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full border text-sm font-bold transition-all duration-200",
                  current
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                    : "border-gray-700 text-gray-400",
                )}
              >
                {item.id}
              </button>
            )
          })}
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {activeLabel}
          </span>
        </div>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-gray-800/70"
          aria-hidden
        >
          <div
            className="h-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${(step / EDITOR_V2_STEPS.length) * 100}%` }}
          />
        </div>
      </nav>

      <nav className="hidden gap-2 md:flex lg:flex-col">
        {EDITOR_V2_STEPS.map((item) => {
          const current = item.id === step
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onStep(item.id)}
              className={cn(
                "inline-flex min-h-12 flex-1 items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200 lg:flex-none",
                current
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-transparent text-gray-400 hover:border-gray-700/60 hover:bg-white/5 hover:text-gray-300",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-all duration-200",
                  current
                    ? "border-emerald-500/50 bg-emerald-500/15"
                    : "border-gray-700 text-gray-400",
                )}
              >
                {item.id}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <item.icon className="size-3.5" aria-hidden />
                  {item.id === 2 ? ticketsLabel : item.label}
                </span>
                <span className="mt-0.5 hidden text-xs text-gray-500 lg:block">
                  {item.id === 2
                    ? `${capacityLabel} y ${ticketsLabel.toLowerCase()}`
                    : item.hint}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

export function EventEditorV2SaveBadge({
  label,
  tone,
  className,
}: {
  label: string
  tone: DraftSaveBadgeTone
  className?: string
}) {
  return (
    <p
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        tone === "saving" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "saved" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "error" && "bg-red-500/10 text-red-700 dark:text-red-400",
        tone === "offline" &&
          "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        tone === "idle" && "text-gray-400",
        className,
      )}
      aria-live="polite"
    >
      {tone === "offline" ? <WifiOff className="size-3.5" aria-hidden /> : null}
      {label}
    </p>
  )
}

export function EventEditorV2ActionDock({
  badge,
  publishDisabled,
  publishTitle,
  publishLabel,
  published,
  onPublish,
}: {
  badge: { label: string; tone: DraftSaveBadgeTone }
  publishDisabled: boolean
  publishTitle: string
  publishLabel: string
  published: boolean
  onPublish: () => void
}) {
  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-800 bg-gray-900/90 p-4 backdrop-blur md:hidden pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <EventEditorV2SaveBadge
          label={badge.label}
          tone={badge.tone}
          className="self-start bg-white/10 text-zinc-100"
        />
        <Button
          type="button"
          disabled={publishDisabled}
          title={publishTitle}
          className={cn(
            "h-12 min-h-12 w-full text-sm font-semibold transition-all duration-200",
            publishDisabled
              ? "cursor-not-allowed opacity-50"
              : published
                ? "bg-sky-600 text-white hover:bg-sky-500"
                : "bg-emerald-500 text-black hover:bg-emerald-400",
          )}
          onClick={onPublish}
        >
          {publishLabel}
        </Button>
      </div>
    </div>
  )
}
