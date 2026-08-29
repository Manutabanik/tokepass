"use client"

import { Info } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCartTotal } from "@/lib/format"
import { useCartLineUnitMoney } from "@/lib/stores/checkout-store"
import { cn } from "@/lib/utils"

export function serviceFeeSplitLabel(ticketPrice: number, feeAmount: number) {
  return `Entrada: ${formatCartTotal(ticketPrice)} | Servicio: ${formatCartTotal(feeAmount)}`
}

export function IncludesServiceFeeHint({
  price,
  className,
}: {
  price: number
  className?: string
}) {
  const money = useCartLineUnitMoney(price)
  if (price <= 0 || money.absorbFees || money.feeAmount <= 0) return null

  return (
    <p
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground italic",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" />}
          className="text-muted-foreground"
          aria-label="Desglose del cargo por servicio"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          {serviceFeeSplitLabel(money.ticketPrice, money.feeAmount)}
        </TooltipContent>
      </Tooltip>
    </p>
  )
}
