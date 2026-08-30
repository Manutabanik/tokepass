"use client"

import { IncludesServiceFeeHint } from "@/components/public/includes-service-fee-hint"
import { formatTicketPrice } from "@/lib/format"
import { useCustomerFacingUnitPrice } from "@/lib/stores/checkout-store"

export function CustomerFacingTicketPrice({
  price,
  freeLabel = "Gratis",
  hintSize = "sm",
}: {
  price: number
  freeLabel?: string
  hintSize?: "sm" | "lg"
}) {
  const customerTotal = useCustomerFacingUnitPrice(price)
  if (price <= 0) return <>{freeLabel}</>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
      {formatTicketPrice(customerTotal)}
      <IncludesServiceFeeHint price={price} iconSize={hintSize} />
    </span>
  )
}
