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

      <div className="flex items-center justify-center gap-5 rounded-2xl border border-zinc-200 bg-white px-6 py-8 dark:border-zinc-800 dark:bg-zinc-900/60">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Quitar una"
          disabled={quantity <= min}
          onClick={() => onChange(Math.max(min, quantity - 1))}
          className="size-14 rounded-2xl border-zinc-300 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-800"
        >
          <Minus className="size-6" aria-hidden="true" />
        </Button>

        <div className="min-w-[4.5rem] text-center">
          <p
            className={cn("text-5xl font-black tabular-nums tracking-tight")}
            style={{ color: accentColor }}
          >
            {quantity}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
            {quantity === 1 ? "entrada" : "entradas"}
          </p>
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Agregar una"
          disabled={quantity >= max}
          onClick={() => onChange(Math.min(max, quantity + 1))}
          className="size-14 rounded-2xl border-zinc-300 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-800"
        >
          <Plus className="size-6" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
