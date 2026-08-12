"use client"

import { Ticket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"

export function EventStickyBuyBar({
  startingPrice,
  soldOut,
}: {
  startingPrice: number | null
  soldOut: boolean
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/85 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4">
        <div className="min-w-0 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Precio desde
          </p>
          <p className="mt-0.5 text-xl font-black tracking-tight text-white">
            {startingPrice == null
              ? "—"
              : startingPrice === 0
                ? "Gratis"
                : formatCurrency(startingPrice)}
          </p>
        </div>
        <Button
          className="h-12 flex-1 rounded-2xl bg-emerald-500 text-base font-bold text-zinc-950 shadow-[0_10px_30px_rgba(16,185,129,0.35)] hover:bg-emerald-400 disabled:opacity-50"
          disabled={soldOut}
          nativeButton={false}
          render={
            <a href="#tickets" aria-disabled={soldOut || undefined} />
          }
        >
          <Ticket className="size-4" aria-hidden="true" />
          {soldOut ? "Agotado" : "Comprar entradas"}
        </Button>
      </div>
    </div>
  )
}
