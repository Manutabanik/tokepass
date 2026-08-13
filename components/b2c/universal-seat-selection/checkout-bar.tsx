"use client"

import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import {
  isSelectionValid,
  selectionSummary,
  selectionTotal,
  type UniversalSeatSelection,
} from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"

export function UniversalCheckoutBar({
  selection,
  pending = false,
  sticky = false,
  onContinue,
}: {
  selection: UniversalSeatSelection | null
  pending?: boolean
  sticky?: boolean
  onContinue: () => void
}) {
  const valid = isSelectionValid(selection)
  const total = selectionTotal(selection)

  return (
    <div
      className={cn(
        "z-40 border-t border-zinc-200 bg-white/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90",
        sticky
          ? "sticky bottom-0 mt-6 rounded-b-3xl"
          : "fixed inset-x-0 bottom-0",
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
            {selectionSummary(selection)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {valid ? `Total ${formatCurrency(total)}` : "Completá tu selección"}
          </p>
        </div>
        <Button
          type="button"
          disabled={!valid || pending}
          onClick={onContinue}
          className="h-12 shrink-0 rounded-2xl bg-emerald-500 px-4 text-sm font-bold text-zinc-950 shadow-[0_10px_30px_rgba(16,185,129,0.35)] hover:bg-emerald-400 disabled:opacity-50"
        >
          {pending ? "Reservando…" : "Continuar al pago"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
