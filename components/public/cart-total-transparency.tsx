"use client"

import type { ReactNode } from "react"
import { Info } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { serviceFeeSplitLabel } from "@/components/public/includes-service-fee-hint"
import { formatCartTotal } from "@/lib/format"
import { useCartPriceBreakdown } from "@/lib/stores/checkout-store"
import { cn } from "@/lib/utils"

export function CartTotalTransparencyTooltip({
  className,
}: {
  className?: string
}) {
  const { ticketPrice, feeAmount, absorbFees } = useCartPriceBreakdown()
  if (absorbFees || feeAmount <= 0) return null

  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        className={cn(
          "inline-flex items-center text-muted-foreground hover:text-foreground",
          className,
        )}
        aria-label="Desglose del total"
      >
        <Info className="size-4" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>
        {serviceFeeSplitLabel(ticketPrice, feeAmount)}
      </TooltipContent>
    </Tooltip>
  )
}

export function CartTotalLabel({
  children = "Total",
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-row items-center gap-1.5 whitespace-nowrap",
        className,
      )}
    >
      {children}
      <CartTotalTransparencyTooltip />
    </span>
  )
}

export function CartTotalAmount({
  amount,
  className,
}: {
  amount: number
  className?: string
}) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {formatCartTotal(amount)}
    </span>
  )
}
