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
  iconSize = "sm",
}: {
  price: number
  className?: string
  iconSize?: "sm" | "lg"
}) {
  const money = useCartLineUnitMoney(price)
  if (price <= 0 || money.absorbFees || money.feeAmount <= 0) return null

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" />}
          className="inline-flex items-center text-muted-foreground hover:text-foreground"
          aria-label="Desglose del cargo por servicio"
        >
          <Info
            className={iconSize === "lg" ? "size-5" : "size-4"}
            aria-hidden="true"
          />
        </TooltipTrigger>
        <TooltipContent>
          {serviceFeeSplitLabel(money.ticketPrice, money.feeAmount)}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
