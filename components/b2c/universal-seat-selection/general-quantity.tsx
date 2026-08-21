"use client"

import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function UniversalGeneralQuantity({
  quantity,
  maxPerUser,
  accentColor,
  onChange,
}: {
  quantity: number
  maxPerUser: number
  accentColor: string
  onChange: (quantity: number) => void
}) {
  const min = 1
  const max = Math.max(1, maxPerUser)

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400/90">
          Paso 2
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
          Seleccioná la cantidad
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
          Máximo {max} entradas por compra en esta zona.
        </p>
      </div>

      <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Quitar una"
          disabled={quantity <= min}
          onClick={() => onChange(Math.max(min, quantity - 1))}
          className="size-9 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5"
        >
          <Minus className="size-4" aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <p
            className={cn("text-xl font-black tabular-nums tracking-tight")}
            style={{ color: accentColor }}
          >
            {quantity}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {quantity === 1 ? "entrada" : "entradas"}
          </p>
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Agregar una"
          disabled={quantity >= max}
          onClick={() => onChange(Math.min(max, quantity + 1))}
          className="size-9 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5"
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
