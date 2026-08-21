"use client"

import { Radio, Sparkles } from "lucide-react"
import { motion } from "motion/react"
import Image from "next/image"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventSwimlane } from "@/components/discovery/event-swimlane"

export function EmptyState({
  fallbackEvents,
}: {
  fallbackEvents: CatalogEvent[]
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="mx-auto flex max-w-lg flex-col items-center px-2 py-8 text-center">
        <div className="relative grid size-28 place-items-center">
          <span
            className="absolute inset-0 rounded-full border border-cyan-400/25 shadow-[0_0_40px_rgba(2,132,199,0.3)]"
            aria-hidden="true"
          />
          <span
            className="tokepass-radar absolute inset-2 rounded-full border border-dashed border-fuchsia-400/40"
            aria-hidden="true"
          />
          <span
            className="tokepass-radar-slow absolute inset-5 rounded-full border border-violet-400/35"
            aria-hidden="true"
          />
          <span className="relative size-14 overflow-hidden rounded-2xl bg-black ring-1 ring-white/15">
            <Image
              src="/brand/tokepass-mark.png"
              alt=""
              width={56}
              height={56}
              className="size-full object-cover"
            />
          </span>
        </div>

        <h2 className="mt-7 flex flex-wrap items-center justify-center gap-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
          <Radio className="size-5 shrink-0 text-fuchsia-300" aria-hidden="true" />
          Sintonizando la agenda de la noche…
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
          No hay fechas confirmadas en esta categoría para hoy, pero mirá lo que
          se viene:
        </p>
      </div>

      {fallbackEvents.length > 0 ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Sparkles className="size-4 text-violet-300" aria-hidden="true" />
            Recomendados para vos
          </p>
          <EventSwimlane events={fallbackEvents.slice(0, 6)} />
        </div>
      ) : null}
    </motion.div>
  )
}
