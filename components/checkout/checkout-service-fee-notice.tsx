"use client"

import { shouldShowServiceFeeInclusiveNotice } from "@/lib/checkout/service-fee-notice"
import { useCartServiceFeeRule } from "@/lib/stores/checkout-store"
import { cn } from "@/lib/utils"

export function CheckoutServiceFeeNotice({
  className,
}: {
  className?: string
}) {
  const { rate, absorbFees } = useCartServiceFeeRule()
  if (!shouldShowServiceFeeInclusiveNotice({ rate, absorbFees })) return null

  return (
    <p
      className={cn(
        "text-center text-xs text-muted-foreground",
        className,
      )}
    >
      Los precios mostrados incluyen cargo por servicio.
    </p>
  )
}
