"use client"

import type { ReactNode } from "react"
import { Info } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { formatCartTotal } from "@/lib/format"
import { useCartPriceBreakdown } from "@/lib/stores/checkout-store"
import { cn } from "@/lib/utils"

export function CartTotalTransparencyTooltip({
  className,
}: {
  className?: string
}) {
  const { subtotal, serviceFee } = useCartPriceBreakdown()
  if (serviceFee <= 0) return null

  const baseAmount = centsToMoney(
    Math.max(0, moneyToCents(subtotal) - moneyToCents(serviceFee)),
  )

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
        Entrada base: {formatCartTotal(baseAmount)} | Cargo por servicio:{" "}
        {formatCartTotal(serviceFee)}
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
