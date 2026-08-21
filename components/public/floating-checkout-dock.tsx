"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { formatTicketPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

const SCROLL_REVEAL_PX = 300

type FloatingCheckoutDockProps = {
  price: number | null
  actionLabel?: string
  onAcquire: () => void
}

export function FloatingCheckoutDock({
  price,
  actionLabel = "Adquirir Entradas",
  onAcquire,
}: FloatingCheckoutDockProps) {
  const reduceMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1023px)")

    function sync() {
      setVisible(mobile.matches && window.scrollY >= SCROLL_REVEAL_PX)
    }

    sync()
    window.addEventListener("scroll", sync, { passive: true })
    mobile.addEventListener("change", sync)
    return () => {
      window.removeEventListener("scroll", sync)
      mobile.removeEventListener("change", sync)
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          role="region"
          aria-label="Comprar entradas"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.22, ease: "easeOut" }
          }
          className={cn(
            "fixed bottom-4 left-4 right-4 z-50 lg:hidden",
            "rounded-2xl border border-border/50 bg-background/80 shadow-2xl shadow-black/40 backdrop-blur-md",
            "px-4 py-3",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Desde
              </p>
              <p className="truncate text-lg font-black tabular-nums text-foreground">
                {price != null ? formatTicketPrice(price) : "Consultar"}
              </p>
            </div>
            <button
              type="button"
              onClick={onAcquire}
              className="shrink-0 rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-black hover:bg-emerald-400"
            >
              {actionLabel}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
