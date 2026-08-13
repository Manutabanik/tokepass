"use client"

import { Check, Loader2, Tag, X } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  validatePromoCode,
  type ValidatedPromo,
} from "@/app/actions/coupons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export function PromoCodeInput({
  eventId,
  cartSubtotal,
  applied,
  onApplied,
  onCleared,
  disabled,
}: {
  eventId: string
  cartSubtotal: number
  applied: ValidatedPromo | null
  onApplied: (promo: ValidatedPromo) => void
  onCleared: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(Boolean(applied))
  const [code, setCode] = useState(applied?.code ?? "")
  const [pending, startTransition] = useTransition()

  function apply() {
    startTransition(async () => {
      const result = await validatePromoCode(code, eventId, cartSubtotal)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      onApplied(result.data)
      setCode(result.data.code)
      toast.success(`Descuento ${result.data.code} aplicado.`)
    })
  }

  if (!open && !applied) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white disabled:opacity-50"
      >
        <Tag className="size-3.5" aria-hidden />
        Tengo un código de descuento
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
        Código de descuento
      </p>
      {applied ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
              <Check className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate font-mono tracking-wide">
                {applied.code}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-emerald-200/80">
              −{formatCurrency(applied.discountAmount)}
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled || pending}
            onClick={() => {
              onCleared()
              setCode("")
            }}
            className="text-emerald-200 hover:bg-emerald-500/20 hover:text-white"
            aria-label="Quitar cupón"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="MEGA20"
            disabled={disabled || pending}
            autoCapitalize="characters"
            className={cn(
              "min-h-12 h-12 flex-1 rounded-xl border-zinc-700 bg-zinc-950 font-mono uppercase text-base text-white",
              "placeholder:normal-case placeholder:text-zinc-500",
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                apply()
              }
            }}
          />
          <Button
            type="button"
            disabled={disabled || pending || !code.trim()}
            onClick={apply}
            className="min-h-12 h-12 min-w-12 rounded-xl bg-zinc-100 px-4 text-base text-zinc-950 hover:bg-white"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              "Aplicar"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
