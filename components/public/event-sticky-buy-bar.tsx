"use client"

import { Ticket } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Barra de conversión fija en mobile.
 * Se oculta al llegar al bloque #tickets (ahí manda el CTA de checkout).
 */
export function EventStickyBuyBar({
  startingPrice,
  soldOut,
}: {
  startingPrice: number | null
  soldOut: boolean
}) {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const target = document.getElementById("tickets")
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShow(!entry?.isIntersecting)
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -20% 0px" },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95",
        "px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md",
        "shadow-[0_-10px_30px_rgba(0,0,0,0.1)] transition-transform duration-200 lg:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      aria-hidden={!show}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
        <div className="min-w-0 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Desde
          </p>
          <p className="mt-0.5 text-2xl font-black tracking-tight text-foreground tabular-nums">
            {startingPrice == null
              ? "—"
              : startingPrice === 0
                ? "Gratis"
                : formatCurrency(startingPrice)}
          </p>
        </div>
        <Button
          className="min-h-12 min-w-[48px] flex-1 rounded-2xl bg-emerald-500 text-base font-black text-zinc-950 shadow-[0_10px_30px_rgba(16,185,129,0.35)] hover:bg-emerald-600 disabled:opacity-50"
          disabled={soldOut}
          nativeButton={false}
          render={
            <a href="#tickets" aria-disabled={soldOut || undefined} />
          }
        >
          <Ticket className="size-5" aria-hidden="true" />
          {soldOut ? "Agotado" : "Comprar Entradas"}
        </Button>
      </div>
    </div>
  )
}
