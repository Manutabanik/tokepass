"use client"

import { Info, Tag } from "lucide-react"

import { FormLabel, FormMessage } from "@/components/ui/form"
import { PriceInput } from "@/components/ui/price-input"
import { STUDIO_CONTROL_CLASS, STUDIO_LABEL_CLASS } from "@/lib/admin/studio-form-styles"
import { formatCurrency } from "@/lib/format"
import { priceFromNetProfit } from "@/lib/pricing/net-profit"
import { cn } from "@/lib/utils"

export function NetProfitCalculator({
  netPrice,
  onNetChange,
  feePercentage,
  fixedFee = 0,
  isSponsored = false,
  invalid = false,
  error,
  name,
}: {
  netPrice: number | undefined
  onNetChange: (net: number) => void
  feePercentage: number
  fixedFee?: number
  isSponsored?: boolean
  invalid?: boolean
  error?: string
  name?: string
}) {
  const rate = isSponsored ? 0 : feePercentage
  const calc = priceFromNetProfit({
    netPrice: Number(netPrice) || 0,
    feePercentage: rate,
    fixedFee,
    sponsored: isSponsored,
  })

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <FormLabel className={STUDIO_LABEL_CLASS}>
          Tu Ganancia Neta (Por entrada)
        </FormLabel>
        <PriceInput
          name={name}
          aria-invalid={invalid || undefined}
          value={netPrice}
          onValueChange={(value) => onNetChange(value ?? 0)}
          placeholder="0"
          allowEmpty
          className={cn(STUDIO_CONTROL_CLASS, "font-semibold tabular-nums")}
        />
        {error ? <FormMessage>{error}</FormMessage> : null}
      </div>
      <div className="space-y-2 rounded-xl bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            TokePass sumará automáticamente un {rate}% de cargo por servicio.
          </span>
        </p>
        <p className="flex items-start gap-2 font-semibold">
          <Tag className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Precio final al público: {formatCurrency(calc.publicPrice)}
          </span>
        </p>
      </div>
    </div>
  )
}
