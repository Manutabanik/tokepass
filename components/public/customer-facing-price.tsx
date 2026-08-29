"use client"

import { formatTicketPrice } from "@/lib/format"
import { useCustomerFacingUnitPrice } from "@/lib/stores/checkout-store"

export function CustomerFacingTicketPrice({
  price,
  freeLabel = "Gratis",
}: {
  price: number
  freeLabel?: string
}) {
  const customerTotal = useCustomerFacingUnitPrice(price)
  if (price <= 0) return <>{freeLabel}</>
  return <>{formatTicketPrice(customerTotal)}</>
}
