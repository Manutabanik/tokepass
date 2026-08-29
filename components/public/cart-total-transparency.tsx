"use client"

import type { ReactNode } from "react"
import { Info } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { serviceFeeSplitLabel } from "@/components/public/includes-service-fee-hint"
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
        className={className}
        aria-label="Desglose del total"
      >
        <Info className="size-3.5" aria-hidden="true" />
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
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children}
      <CartTotalTransparencyTooltip />
    </span>
  )
}
